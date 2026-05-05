import { Server } from 'socket.io';
import { dataNormalize } from '../helpers/dataNormalize';
import * as gamesService from '../subjects/games/gamesService';
import { wsEvents } from '../wsFlow';

// Per-game vote timer map — only one timer per game can be active at a time
const voteTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Returns the list of players who are eligible to vote:
 * alive players (not in killed[]) excluding the GM (non-player character)
 * and the prostituteBlock player.
 */
const calculateEligibleVoters = (game: any): string[] => {
  const players: string[] = (game.players ?? []).map((p: any) => p.toString());
  const killed: string[] = game.gameFlow?.killed ?? [];
  const prostituteBlock: string = game.gameFlow?.prostituteBlock ?? '';
  const gm: string = game.gm?.toString() ?? '';

  const alivePlayers = players.filter((p) => !killed.includes(p));
  return alivePlayers.filter((p) => p !== prostituteBlock && p !== gm);
};

/**
 * Finalizes the current vote for the given game:
 * - Randomizes votes for players who have not yet voted
 * - Sets isVote = false
 * - Emits voteTimerExpired and gameUpdate to all clients in the room
 *
 * This is the single source of truth for vote finalization, used by both
 * the scheduled timer and the early-close path (all votes in).
 */
const autoFinalizeVote = async (gameId: string, io: Server): Promise<void> => {
  try {
    const game = await gamesService.getGame(gameId);
    if (!game) return;

    // Guard against double-fire: if someone else already closed the vote, skip
    if (!game.gameFlow?.isVote) {
      console.log(`[VoteTimer] Game ${gameId}: isVote already false — skipping auto-finalize`);
      return;
    }

    const proposed: string[] = game.gameFlow?.proposed ?? [];
    const currentVoted: Record<string, string[]> = game.gameFlow?.voted ?? {};
    const eligibleVoters = calculateEligibleVoters(game);

    if (proposed.length === 0) {
      console.log(`[VoteTimer] Game ${gameId}: no proposed players — closing vote without randomization`);
      const updatedGame = await gamesService.updateGame(gameId, { 'gameFlow.isVote': false } as any);
      if (!updatedGame) return;
      io.to(gameId).emit(wsEvents.voteTimerExpired, { gameId, finalVoted: currentVoted });
      io.to(gameId).emit(wsEvents.gameUpdate, dataNormalize(updatedGame));
      return;
    }

    // Deep-clone the voted map so we don't mutate the cache reference
    const finalVoted: Record<string, string[]> = JSON.parse(JSON.stringify(currentVoted));
    const alreadyVotedPlayerIds = Object.values(finalVoted).flat();

    const notVotedPlayers = eligibleVoters.filter(
      (player) => !alreadyVotedPlayerIds.includes(player)
    );

    // Randomly assign each non-voter to a candidate, preferring candidates
    // that are not the voter themselves (same algorithm as the former FE logic)
    for (const player of notVotedPlayers) {
      let candidateList = proposed.filter((p) => p !== player);
      if (candidateList.length === 0) {
        candidateList = proposed;
      }
      const randomCandidate = candidateList[Math.floor(Math.random() * candidateList.length)];
      finalVoted[randomCandidate] = [...(finalVoted[randomCandidate] ?? []), player];
    }

    const updatedGame = await gamesService.updateGame(gameId, {
      'gameFlow.voted': finalVoted,
      'gameFlow.isVote': false,
    } as any);

    if (!updatedGame) return;

    console.log(
      `[VoteTimer] Game ${gameId}: vote finalized. ` +
      `Randomized ${notVotedPlayers.length} missing vote(s). Broadcasting.`
    );

    io.to(gameId).emit(wsEvents.voteTimerExpired, { gameId, finalVoted });
    io.to(gameId).emit(wsEvents.gameUpdate, dataNormalize(updatedGame));
  } catch (error) {
    console.error(`[VoteTimer] Error auto-finalizing vote for game ${gameId}:`, error);
  }
};

/**
 * Cancels the active vote timer for a game if one exists.
 * Call this when isVote is manually set to false, or on game restart / finish / day-night transition.
 */
export const cancelVoteTimer = (gameId: string): void => {
  const existing = voteTimers.get(gameId);
  if (existing) {
    clearTimeout(existing);
    voteTimers.delete(gameId);
    console.log(`[VoteTimer] Cancelled vote timer for game ${gameId}`);
  }
};

/**
 * Schedules a server-side vote timer for the given game.
 * When the timer expires, missing votes are randomized and isVote is set to false.
 *
 * If votesTime <= 0, no timer is started (voting stays open until all votes are in manually).
 * Any previously running timer for this game is cancelled before scheduling a new one.
 */
export const scheduleVoteTimer = (gameId: string, votesTime: number, io: Server): void => {
  // Always cancel any running timer before starting a new one (handles re-vote rounds)
  cancelVoteTimer(gameId);

  if (votesTime <= 0) {
    console.log(`[VoteTimer] Game ${gameId}: votesTime is 0 — no timer scheduled`);
    return;
  }

  console.log(`[VoteTimer] Game ${gameId}: scheduling vote timer for ${votesTime}s`);

  const timer = setTimeout(() => {
    voteTimers.delete(gameId);
    autoFinalizeVote(gameId, io);
  }, votesTime * 1_000);

  voteTimers.set(gameId, timer);
};

/**
 * Checks whether all eligible voters have already cast their vote.
 * If so, cancels the timer and immediately finalizes the vote (early-close path).
 *
 * Call this after every successful addVote operation.
 */
export const checkAllVotesIn = async (gameId: string, io: Server): Promise<void> => {
  try {
    const game = await gamesService.getGame(gameId);
    if (!game || !game.gameFlow?.isVote) return;

    const eligibleVoters = calculateEligibleVoters(game);
    if (eligibleVoters.length === 0) return;

    const voted: Record<string, string[]> = game.gameFlow?.voted ?? {};
    const alreadyVotedCount = Object.values(voted).flat().length;

    if (alreadyVotedCount >= eligibleVoters.length) {
      console.log(
        `[VoteTimer] Game ${gameId}: all ${eligibleVoters.length} eligible voter(s) have voted — early close`
      );
      cancelVoteTimer(gameId);
      await autoFinalizeVote(gameId, io);
    }
  } catch (error) {
    console.error(`[VoteTimer] Error checking all-votes-in for game ${gameId}:`, error);
  }
};

/**
 * Single-candidate fast-path:
 * If there is exactly one proposed candidate, all eligible voters are immediately
 * assigned to them, isVote is set to false, and the result is broadcast.
 *
 * Returns true if the fast-path was executed, false otherwise.
 */
export const handleSingleCandidateFastPath = async (
  gameId: string,
  io: Server
): Promise<boolean> => {
  try {
    const game = await gamesService.getGame(gameId);
    if (!game || !game.gameFlow?.isVote) return false;

    const proposed: string[] = game.gameFlow?.proposed ?? [];
    if (proposed.length !== 1) return false;

    const eligibleVoters = calculateEligibleVoters(game);
    const finalVoted: Record<string, string[]> = { [proposed[0]]: eligibleVoters };

    const updatedGame = await gamesService.updateGame(gameId, {
      'gameFlow.voted': finalVoted,
      'gameFlow.isVote': false,
    } as any);

    if (!updatedGame) return false;

    cancelVoteTimer(gameId);

    console.log(
      `[VoteTimer] Game ${gameId}: single-candidate fast-path executed for candidate ${proposed[0]}`
    );

    io.to(gameId).emit(wsEvents.voteTimerExpired, { gameId, finalVoted });
    io.to(gameId).emit(wsEvents.gameUpdate, dataNormalize(updatedGame));

    return true;
  } catch (error) {
    console.error(`[VoteTimer] Error in single-candidate fast-path for game ${gameId}:`, error);
    return false;
  }
};

