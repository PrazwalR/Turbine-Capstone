use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct VaultState {
    pub owner: Pubkey,
    pub lock_duration: i64,
    pub deposit_timestamp: i64,
    pub amount_deposited: u64,
    pub bump: u8,
    pub vault_bump: u8,
}
