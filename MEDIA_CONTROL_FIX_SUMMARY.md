# Зміни в бекенді для вирішення проблеми LiveKit unmute

## Проблема
```
[LiveKit] Error unmuting microphone: Precondition Failed: remote unmute not enabled
```

LiveKit НЕ ДОЗВОЛЯЄ серверу виконувати `unmute` операції через обмеження безпеки. Сервер може тільки **MUTE** треки.

## Рішення

### ✅ Що було змінено

#### 1. `src/services/livekitService.ts`

**Генерація токена** - додано `canUpdateOwnMetadata`:
```typescript
token.addGrant({
  room: roomName,
  roomJoin: true,
  canPublish: true,
  canSubscribe: true,
  canPublishData: true,
  canUpdateOwnMetadata: true,  // ← НОВЕ
});
```

**Функція `muteParticipantTrackBySource`** - змінена логіка:
- Для **MUTE** (enabled=false): виконується серверний mute через LiveKit API
- Для **UNMUTE** (enabled=true): повертається `{ handledByClient: true }` без виклику API

#### 2. `src/wsFlow.ts`

**Подія `toggleUserMicrophone`** - оновлена логіка:
```typescript
if (shouldMute) {
  // Виконуємо серверний mute
  await livekitService.muteParticipantTrackBySource(
    roomId,
    participantIdentity,
    'microphone',
    true
  );
} else {
  // Для unmute просто логуємо - unmute виконає клієнт
  console.log(`[WS] Unmute request - sending command to client`);
}

// Відправляємо подію всім з додатковими полями
io.to(roomId).emit(wsEvents.userMicrophoneStatusChanged, {
  userId,
  participantIdentity,      // ← НОВЕ
  enabled,
  targetIdentity: participantIdentity,  // ← НОВЕ
});
```

**Подія `toggleUserCamera`** - аналогічні зміни для камери

**Подія `batchToggleMicrophones`** - оновлена для batch операцій:
```typescript
if (shouldMute) {
  // Mute через API для всіх користувачів
  const results = await Promise.allSettled(/* ... */);
} else {
  // Unmute - відправляємо події всім клієнтам
  usersToProcess.forEach((userId) => {
    io.to(roomId).emit(wsEvents.userMicrophoneStatusChanged, {
      userId,
      participantIdentity: userId,
      enabled: true,
      targetIdentity: userId,
    });
  });
}
```

#### 3. `src/subjects/games/gamesService.ts`

**Функція `addUserToProposed`** - додана перевірка на дублікати:
```typescript
export const addUserToProposed = async (id: string, userId: string) => {
  const game = await Games.findById(id);
  
  // Перевірка на існування
  if (!game) {
    throw new Error(`Game with id ${id} not found`);
  }
  
  // Перевірка на дублікат
  if (game.gameFlow.proposed.includes(userId)) {
    console.log(`User ${userId} already in proposed list`);
    return game;
  }
  
  // Додавання через $addToSet
  const updatedGame = await Games.findOneAndUpdate(
    { _id: id },
    { $addToSet: { 'gameFlow.proposed': userId } },
    { new: true }
  );
  
  return updatedGame;
};
```

## 📋 Що потрібно зробити на фронтенді

### 1. Додайте обробку WebSocket подій

```typescript
socket.on('userMicrophoneStatusChanged', async ({ userId, participantIdentity, enabled, targetIdentity }) => {
  const currentUser = userStore.currentUser;
  
  // Якщо команда для поточного користувача
  if (targetIdentity === currentUser.id || targetIdentity === currentUser.identity) {
    if (enabled) {
      // Клієнт сам unmute свій мікрофон
      await localParticipant.setMicrophoneEnabled(true);
    } else {
      // Клієнт сам mute свій мікрофон
      await localParticipant.setMicrophoneEnabled(false);
    }
  }
  
  // Оновіть UI
  updateParticipantMediaState(userId, { microphoneEnabled: enabled });
});
```

### 2. НЕ викликайте `setMicrophoneEnabled` при відправці команди

```typescript
// ❌ НЕПРАВИЛЬНО
const toggleMicrophone = async (userId, enabled) => {
  socket.emit('toggleUserMicrophone', { ... });
  await localParticipant.setMicrophoneEnabled(enabled); // ← НЕ РОБІТЬ ЦЕ!
};

// ✅ ПРАВИЛЬНО
const toggleMicrophone = async (userId, enabled) => {
  socket.emit('toggleUserMicrophone', { ... });
  // Зміна стану відбудеться через WebSocket подію
};
```

## 🎯 Як це працює

### Схема для MUTE (enabled=false)

1. Користувач/GM натискає кнопку "Вимкнути мікрофон"
2. Фронтенд відправляє `socket.emit('toggleUserMicrophone', { enabled: false })`
3. **Бекенд виконує серверний mute** через LiveKit API
4. Бекенд відправляє `io.emit('userMicrophoneStatusChanged', { enabled: false })`
5. Всі клієнти отримують подію та оновлюють UI
6. Цільовий клієнт виконує `localParticipant.setMicrophoneEnabled(false)`

### Схема для UNMUTE (enabled=true)

1. Користувач/GM натискає кнопку "Увімкнути мікрофон"
2. Фронтенд відправляє `socket.emit('toggleUserMicrophone', { enabled: true })`
3. **Бекенд НЕ викликає LiveKit API** (просто логує)
4. Бекенд відправляє `io.emit('userMicrophoneStatusChanged', { enabled: true })`
5. Всі клієнти отримують подію та оновлюють UI
6. **Цільовий клієнт виконує `localParticipant.setMicrophoneEnabled(true)`** ← Unmute виконує клієнт!

## 📝 Додаткові деталі

### Нові поля в WebSocket подіях

```typescript
interface MediaStatusChangeEvent {
  userId: string;              // ID користувача в БД
  participantIdentity: string; // Identity в LiveKit (зазвичай === userId)
  enabled: boolean;            // true = увімкнено, false = вимкнено
  targetIdentity: string;      // Identity користувача, який має виконати дію
}
```

### Перевірка доступу

- **Self control**: Користувач завжди може керувати своїми медіа
- **GM control**: GM може керувати будь-якими медіа в грі
- **Non-GM**: Не може керувати медіа інших користувачів

### Логування

Всі операції логуються:
```
[WS] Unmute request for microphone - sending command to client ${participantIdentity}
[LiveKit] Unmute request for microphone - this will be handled by client-side
[Batch] Unmute request - sending commands to ${count} clients
```

## 🧪 Тестування

1. **Self toggle**: Користувач вмикає/вимикає свій мікрофон
2. **GM toggle**: GM вмикає/вимикає мікрофон гравця
3. **Batch mute**: GM вимикає всі мікрофони
4. **Batch unmute**: GM вмикає всі мікрофони
5. **Camera controls**: Аналогічно для камери

## 📚 Додаткові файли

- `MEDIA_CONTROL_CLIENT_IMPLEMENTATION.md` - детальні інструкції для фронтенду з прикладами коду

## ✨ Переваги рішення

1. ✅ Відповідає обмеженням безпеки LiveKit
2. ✅ Сервер може примусово вимкнути медіа (важливо для GM)
3. ✅ Клієнт контролює увімкнення свого медіа (unmute)
4. ✅ Працює як для індивідуальних, так і для batch операцій
5. ✅ Додано перевірку на дублікати в `addUserToProposed`
6. ✅ Детальне логування для дебагу

## 🚀 Готово до використання

Бекенд готовий! Тепер потрібно імплементувати обробку подій на фронтенді згідно з інструкціями у файлі `MEDIA_CONTROL_CLIENT_IMPLEMENTATION.md`.

