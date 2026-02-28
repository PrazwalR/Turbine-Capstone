use anchor_lang::prelude::*;

mod contexts;
mod state;

use contexts::*;

declare_id!("A5foX28GLF2ExDMHtLzSvKKFHoo2BnCy3HCiksSxqG7p");

#[program]
pub mod time_locked_vault {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, lock_duration: i64) -> Result<()> {
        ctx.accounts.initialize(lock_duration, &ctx.bumps)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        ctx.accounts.deposit(amount)
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        ctx.accounts.withdraw(amount)
    }

    pub fn close(ctx: Context<Close>) -> Result<()> {
        ctx.accounts.close()
    }
}
