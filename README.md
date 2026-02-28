# Time-Locked Vault — Solana Turbine Capstone

A Solana program built with Anchor that implements a **time-locked vault**. Users deposit SOL that can only be withdrawn after a configurable lock duration expires.

## Devnet Program ID

```
A5foX28GLF2ExDMHtLzSvKKFHoo2BnCy3HCiksSxqG7p
```

[View on Solana Explorer](https://explorer.solana.com/address/A5foX28GLF2ExDMHtLzSvKKFHoo2BnCy3HCiksSxqG7p?cluster=devnet)

## Constraint Logic

The vault enforces a **time-based withdrawal restriction**:

- On `initialize`, the owner sets a `lock_duration` (in seconds)
- On `deposit`, the current `unix_timestamp` is recorded as `deposit_timestamp`
- On `withdraw`, the program checks: `current_time >= deposit_timestamp + lock_duration`
- If the lock hasn't expired, the transaction fails with `TimeLockNotExpired`
- `close` drains any remaining SOL from the vault PDA and reclaims the state account rent

## PDAs

| PDA | Seeds | Purpose |
|-----|-------|---------|
| Vault State | `["state", owner]` | Stores owner, lock_duration, deposit_timestamp, amount, bumps |
| Vault | `["vault", vault_state]` | Holds the deposited SOL |

## Instructions

| Instruction | Description |
|-------------|-------------|
| `initialize(lock_duration)` | Creates vault state with the specified lock duration |
| `deposit(amount)` | Transfers SOL from owner into the vault PDA, records timestamp |
| `withdraw(amount)` | Withdraws SOL only if the time lock has expired |
| `close()` | Drains vault and closes the state account, returning rent to owner |

## Tests

All 5 tests passing:

```
  time_locked_vault
    ✔ initializes the vault
    ✔ deposits SOL into the vault
    ✔ fails to withdraw before lock expires
    ✔ withdraws SOL after lock expires
    ✔ closes the vault and reclaims rent

  5 passing (7s)
```



## Build & Test

```bash
cd time_locked_vault
anchor build
anchor test
```

## Deploy

```bash
anchor deploy --provider.cluster devnet
```
