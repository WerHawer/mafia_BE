# Інструкції по імплементації керування медіа на клієнті

## Проблема з LiveKit
LiveKit **НЕ ДОЗВОЛЯЄ** серверу виконувати `unmute` для треків користувачів через обмеження безпеки. Сервер може **тільки MUTE** треки.

Для `unmute` операцій потрібно відправляти команду клієнту, і клієнт сам виконує unmute свого треку.

## Зміни на бекенді (виконано)

### 1. Оновлено генерацію токена доступу
Додано `canUpdateOwnMetadata: true` для можливості оновлення метаданих.

### 2. Змінено логіку mute/unmute
- **MUTE (enabled=false)**: Сервер виконує серверний mute через LiveKit API
- **UNMUTE (enabled=true)**: Сервер НЕ викликає LiveKit API, а тільки відправляє WebSocket подію

### 3. Оновлено WebSocket події
Тепер події `userMicrophoneStatusChanged` і `userCameraStatusChanged` містять:
```typescript
{
  userId: string;
  participantIdentity: string;  // NEW
  enabled: boolean;
  targetIdentity: string;        // NEW - identity користувача, який має обробити команду
}
```

## Імплементація на фронтенді

### 1. Додайте обробку WebSocket подій

```typescript
// В вашому LiveKit компоненті або stores

socket.on('userMicrophoneStatusChanged', async ({ 
  userId, 
  participantIdentity, 
  enabled, 
  targetIdentity 
}) => {
  const currentUser = userStore.currentUser; // ваш поточний користувач
  
  // Якщо команда для поточного користувача
  if (targetIdentity === currentUser.id || targetIdentity === currentUser.identity) {
    if (enabled) {
      // UNMUTE - клієнт сам unmute свій мікрофон
      await localParticipant.setMicrophoneEnabled(true);
      console.log('Microphone unmuted by server command');
    } else {
      // MUTE - можна також обробити на клієнті або сервер вже замьютив
      await localParticipant.setMicrophoneEnabled(false);
      console.log('Microphone muted by server command');
    }
  }
  
  // Оновіть UI для всіх учасників
  updateParticipantMediaState(userId, { microphoneEnabled: enabled });
});

socket.on('userCameraStatusChanged', async ({ 
  userId, 
  participantIdentity, 
  enabled, 
  targetIdentity 
}) => {
  const currentUser = userStore.currentUser;
  
  if (targetIdentity === currentUser.id || targetIdentity === currentUser.identity) {
    if (enabled) {
      // UNMUTE - клієнт сам unmute свою камеру
      await localParticipant.setCameraEnabled(true);
      console.log('Camera unmuted by server command');
    } else {
      // MUTE
      await localParticipant.setCameraEnabled(false);
      console.log('Camera muted by server command');
    }
  }
  
  updateParticipantMediaState(userId, { cameraEnabled: enabled });
});
```

### 2. Оновіть функції toggle на фронті

```typescript
const toggleMicrophone = async (userId: string, enabled: boolean) => {
  try {
    const currentUser = userStore.currentUser;
    const gameId = gameStore.currentGame.id;
    
    // Відправляємо запит на сервер
    socket.emit('toggleUserMicrophone', {
      roomId: gameId,
      userId: userId,
      participantIdentity: userId, // або отримайте з LiveKit participant
      enabled: enabled,
      requesterId: currentUser.id,
    });
    
    // НЕ РОБІТЬ localParticipant.setMicrophoneEnabled тут!
    // Це зробиться автоматично через WebSocket подію
  } catch (error) {
    console.error('Error toggling microphone:', error);
  }
};

const toggleCamera = async (userId: string, enabled: boolean) => {
  try {
    const currentUser = userStore.currentUser;
    const gameId = gameStore.currentGame.id;
    
    socket.emit('toggleUserCamera', {
      roomId: gameId,
      userId: userId,
      participantIdentity: userId,
      enabled: enabled,
      requesterId: currentUser.id,
    });
  } catch (error) {
    console.error('Error toggling camera:', error);
  }
};
```

### 3. Для Batch операцій

```typescript
const batchToggleMicrophones = async (
  targetUserIds: string[], 
  enabled: boolean, 
  excludedUserIds: string[] = []
) => {
  const currentUser = userStore.currentUser;
  const gameId = gameStore.currentGame.id;
  
  socket.emit('batchToggleMicrophones', {
    roomId: gameId,
    enabled: enabled,
    targetUserIds: targetUserIds,
    excludedUserIds: excludedUserIds,
    requesterId: currentUser.id,
  });
};

// Обробка результату
socket.on('batchOperationComplete', ({ operation, enabled, processedCount }) => {
  console.log(`Batch ${operation} completed: ${processedCount} users affected`);
  // Оновіть UI
});
```

## Важливі нюанси

1. **Не дублюйте дії**: Коли відправляєте команду через socket, НЕ викликайте `localParticipant.setMicrophoneEnabled()` одразу. Зачекайте на WebSocket подію.

2. **Перевіряйте identity**: Завжди перевіряйте `targetIdentity` перед виконанням дії на клієнті.

3. **Обробка помилок**: LiveKit може не виконати команду, якщо трек не існує або користувач ще не підключився. Обробляйте помилки.

4. **GM controls**: Тільки GM може викликати batch операції та керувати іншими користувачами.

5. **Self control**: Користувач завжди може керувати своїми треками.

## Тестування

1. **Тест 1: Self mute/unmute**
   - Користувач вимикає свій мікрофон → має вимкнутись
   - Користувач вмикає свій мікрофон → має ввімкнутись

2. **Тест 2: GM mute user**
   - GM вимикає мікрофон гравця → має вимкнутись у гравця
   - GM вмикає мікрофон гравця → має ввімкнутись у гравця

3. **Тест 3: Batch mute all**
   - GM вимикає всі мікрофони → всі мають вимкнутись
   - GM вмикає всі мікрофони → всі мають ввімкнутись

4. **Тест 4: Camera controls**
   - Аналогічно тестам для мікрофона

## Логи для дебагу

Переконайтеся, що у вас є логи:
- При відправці команди через socket
- При отриманні WebSocket події
- При виконанні `setMicrophoneEnabled` / `setCameraEnabled`
- При помилках від LiveKit

Приклад:
```typescript
console.log('[Media Control] Sending toggle command:', { userId, enabled });
console.log('[Media Control] Received status change:', { userId, enabled, targetIdentity });
console.log('[Media Control] Executing local toggle:', { enabled });
```

