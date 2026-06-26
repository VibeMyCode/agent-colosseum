# Persistent Match Arena — полный редизайн флоу матча

## Концепция

Матч становится **персистентной комнатой с чемпионом**. После боя чемпион остаётся, проигравший выходит. Новые challenger'ы могут заходить и играть против чемпиона. Банк чемпиона накапливается с каждой победой.

## Новый флоу

1. **CreateMatch(stake)** → Waiting (чемпиона нет)
2. **JoinMatch(match_id)** → Ready (если чемпиона нет → первый join; если есть → challenger vs champion)
3. **SetBattleResult(match_id, winner)** → победитель = champion, проигравший выходит
   - Ставка проигравшего (минус fee) → champion.bank
   - Если чемпион проиграл → новый чемпион получает bank
   - Матч → Waiting (открыт для нового challenger'а)
4. **Из Waiting с чемпионом**:
   - **ClaimBank(match_id)** → чемпион забирает bank, матч → Completed
   - **JoinMatch(match_id)** → новый challenger против чемпиона
   - Ставка чемпиона берётся из bank (если хватает), остаток — с кошелька
   - Ставка challenger'а — с его кошелька
5. **ExitMatch(match_id)** — участник выходит
   - Если вызывают оба (или один) → выход из матча
   - Если чемпион выходит → матч в Waiting без чемпиона (bank обнуляется, как бы "закрыл" чемпион)
6. **Rematch** (опционально, можно оставить в упрощённом виде)

## Изменения контракта (`app/src/lib.rs`)

### Match struct — новые поля
```rust
pub struct Match {
    // существующие поля...
    pub champion: Option<ActorId>,  // текущий чемпион
    pub bank: u128,                  // накопленный выигрыш чемпиона
}
```

### MatchView — новые поля
```rust
pub champion: Option<ActorId>,
pub bank: u128,
```

### Новая ошибка
`MatchNotActive` — при попытке джойна в неподходящий матч

### Изменит SetBattleResult
- Статус → Waiting (не Completed)
- Победитель = champion
- Банк пополняется: bank += loser_stake - fee
- Победителю — win, проигравшему — loss
- **Важно**: если champion уже есть и проиграл → bank переходит новому champion'у

### Новые функции

#### claim_bank(&mut self, match_id: u64) -> u128
- Только champion может вызвать
- Отправляет bank вызывающему + возвращает размер выигрыша
- Матч → Completed (можно Claimed после claim_winnings?)

#### exit_match(&mut self, match_id: u64)
- Любой участник может выйти
- Если выходит champion — bank обнуляется, champion = None
- Если выходит agent_b — просто agent_b = zero()

### Изменит join_match
- Если match имеет champion:
  - challenger оплачивает свою ставку с кошелька
  - champion'у ставка не нужна (участвует бесплатно, но риск — bank)
  - agent_a = champion, agent_b = challenger
  - match → Ready
- Если champion нет — как сейчас

### Изменит declare_rematch
- Должен проверять Completed статус, а не Waiting
- При рематче champion остаётся

## Изменения фронтенда

### BattleModal.tsx — новый флоу после победы
После SetBattleResult (match.status = Waiting, match.champion = winner):
- Показать "🏆 X is champion!" + размер bank
- Кнопки:
  - **"Claim Bank · 49 VARA"** — вызывает claim_bank
  - **"Stay as Champion"** — match открыт для нового challenger'а
- Если пользователь проиграл:
  - **"Exit"** — вызывает exit_match

### MatchCard.tsx — показать банк
Если match.champion есть:
- "🏆 champion: X · Bank: Y VARA"
- Показывать в карточке матча

### Status
- Использовать существующие статусы (Waiting, Ready, Completed, Claimed, Closed)
- "Waiting" с чемпионом визуально отличается (показать champion + bank)

### colosseum.ts — новые функции
- `claimBank(sails, signArgs, matchId)` — вызывает claim_bank
- `exitMatch(sails, signArgs, matchId)` — вызывает exit_match
- В `MatchView` type добавить `champion?: string`, `bank?: bigint`
- В `MatchStatus` оставить как есть (Waiting, Ready, Completed, Claimed, Closed)

## Порядок деплоя

1. Сначала изменения Rust контракта
2. Тесты: 6+ тестов для новой логики
3. cargo build --release + wasm-opt -O3
4. Деплой на testnet
5. Изменения фронтенда
6. Пуш в гитхаб
