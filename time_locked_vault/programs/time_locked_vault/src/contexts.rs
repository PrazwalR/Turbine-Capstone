use crate::state::VaultState;
use anchor_lang::prelude::*;
use anchor_lang::system_program;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + VaultState::INIT_SPACE,
        seeds = [b"state", owner.key().as_ref()],
        bump,
    )]
    pub vault_state: Account<'info, VaultState>,

    #[account(
        seeds = [b"vault", vault_state.key().as_ref()],
        bump,
    )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> Initialize<'info> {
    pub fn initialize(&mut self, lock_duration: i64, bumps: &InitializeBumps) -> Result<()> {
        self.vault_state.set_inner(VaultState {
            owner: self.owner.key(),
            lock_duration,
            deposit_timestamp: 0,
            amount_deposited: 0,
            bump: bumps.vault_state,
            vault_bump: bumps.vault,
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        has_one = owner,
        seeds = [b"state", owner.key().as_ref()],
        bump = vault_state.bump,
    )]
    pub vault_state: Account<'info, VaultState>,

    #[account(
        mut,
        seeds = [b"vault", vault_state.key().as_ref()],
        bump = vault_state.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> Deposit<'info> {
    pub fn deposit(&mut self, amount: u64) -> Result<()> {
        let clock = Clock::get()?;
        self.vault_state.deposit_timestamp = clock.unix_timestamp;
        self.vault_state.amount_deposited = self
            .vault_state
            .amount_deposited
            .checked_add(amount)
            .unwrap();

        system_program::transfer(
            CpiContext::new(
                self.system_program.to_account_info(),
                system_program::Transfer {
                    from: self.owner.to_account_info(),
                    to: self.vault.to_account_info(),
                },
            ),
            amount,
        )
    }
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        has_one = owner,
        seeds = [b"state", owner.key().as_ref()],
        bump = vault_state.bump,
    )]
    pub vault_state: Account<'info, VaultState>,

    #[account(
        mut,
        seeds = [b"vault", vault_state.key().as_ref()],
        bump = vault_state.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> Withdraw<'info> {
    pub fn withdraw(&mut self, amount: u64) -> Result<()> {
        let clock = Clock::get()?;
        let unlock_time = self
            .vault_state
            .deposit_timestamp
            .checked_add(self.vault_state.lock_duration)
            .unwrap();

        require!(
            clock.unix_timestamp >= unlock_time,
            VaultError::TimeLockNotExpired
        );

        require!(
            amount <= self.vault.lamports(),
            VaultError::InsufficientFunds
        );

        let vault_state_key = self.vault_state.key();
        let seeds = &[
            b"vault",
            vault_state_key.as_ref(),
            &[self.vault_state.vault_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        system_program::transfer(
            CpiContext::new_with_signer(
                self.system_program.to_account_info(),
                system_program::Transfer {
                    from: self.vault.to_account_info(),
                    to: self.owner.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        self.vault_state.amount_deposited = self
            .vault_state
            .amount_deposited
            .checked_sub(amount)
            .unwrap();

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Close<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        has_one = owner,
        seeds = [b"state", owner.key().as_ref()],
        bump = vault_state.bump,
        close = owner,
    )]
    pub vault_state: Account<'info, VaultState>,

    #[account(
        mut,
        seeds = [b"vault", vault_state.key().as_ref()],
        bump = vault_state.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> Close<'info> {
    pub fn close(&mut self) -> Result<()> {
        let vault_state_key = self.vault_state.key();
        let seeds = &[
            b"vault",
            vault_state_key.as_ref(),
            &[self.vault_state.vault_bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let lamports = self.vault.lamports();

        if lamports > 0 {
            system_program::transfer(
                CpiContext::new_with_signer(
                    self.system_program.to_account_info(),
                    system_program::Transfer {
                        from: self.vault.to_account_info(),
                        to: self.owner.to_account_info(),
                    },
                    signer_seeds,
                ),
                lamports,
            )?;
        }

        Ok(())
    }
}

#[error_code]
pub enum VaultError {
    #[msg("The time lock has not expired yet")]
    TimeLockNotExpired,
    #[msg("Insufficient funds in the vault")]
    InsufficientFunds,
}
