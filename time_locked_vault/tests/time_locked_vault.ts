import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TimeLockedVault } from "../target/types/time_locked_vault";
import { assert } from "chai";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

describe("time_locked_vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.timeLockedVault as Program<TimeLockedVault>;
  const owner = provider.wallet;
  const LOCK_DURATION = 3;
  const DEPOSIT_AMOUNT = 1 * LAMPORTS_PER_SOL;

  const [vaultStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("state"), owner.publicKey.toBuffer()],
    program.programId
  );

  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), vaultStatePda.toBuffer()],
    program.programId
  );

  it("initializes the vault", async () => {
    const tx = await program.methods
      .initialize(new anchor.BN(LOCK_DURATION))
      .accountsPartial({
        owner: owner.publicKey,
        vaultState: vaultStatePda,
        vault: vaultPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const state = await program.account.vaultState.fetch(vaultStatePda);
    assert.ok(state.owner.equals(owner.publicKey));
    assert.equal(state.lockDuration.toNumber(), LOCK_DURATION);
    assert.equal(state.amountDeposited.toNumber(), 0);
    console.log("Initialize tx:", tx);
  });

  it("deposits SOL into the vault", async () => {
    const balanceBefore = await provider.connection.getBalance(vaultPda);

    const tx = await program.methods
      .deposit(new anchor.BN(DEPOSIT_AMOUNT))
      .accountsPartial({
        owner: owner.publicKey,
        vaultState: vaultStatePda,
        vault: vaultPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const balanceAfter = await provider.connection.getBalance(vaultPda);
    assert.equal(balanceAfter - balanceBefore, DEPOSIT_AMOUNT);

    const state = await program.account.vaultState.fetch(vaultStatePda);
    assert.equal(state.amountDeposited.toNumber(), DEPOSIT_AMOUNT);
    console.log("Deposit tx:", tx);
  });

  it("fails to withdraw before lock expires", async () => {
    try {
      await program.methods
        .withdraw(new anchor.BN(DEPOSIT_AMOUNT))
        .accountsPartial({
          owner: owner.publicKey,
          vaultState: vaultStatePda,
          vault: vaultPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      assert.fail("Should have thrown an error");
    } catch (err) {
      assert.include(err.toString(), "TimeLockNotExpired");
      console.log("Early withdrawal correctly rejected");
    }
  });

  it("withdraws SOL after lock expires", async () => {
    console.log(`Waiting ${LOCK_DURATION + 1}s for lock to expire...`);
    await new Promise((resolve) =>
      setTimeout(resolve, (LOCK_DURATION + 1) * 1000)
    );

    const ownerBefore = await provider.connection.getBalance(owner.publicKey);

    const tx = await program.methods
      .withdraw(new anchor.BN(DEPOSIT_AMOUNT))
      .accountsPartial({
        owner: owner.publicKey,
        vaultState: vaultStatePda,
        vault: vaultPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const ownerAfter = await provider.connection.getBalance(owner.publicKey);
    assert.isAbove(ownerAfter, ownerBefore);

    const state = await program.account.vaultState.fetch(vaultStatePda);
    assert.equal(state.amountDeposited.toNumber(), 0);
    console.log("Withdraw tx:", tx);
  });

  it("closes the vault and reclaims rent", async () => {
    const ownerBefore = await provider.connection.getBalance(owner.publicKey);

    const tx = await program.methods
      .close()
      .accountsPartial({
        owner: owner.publicKey,
        vaultState: vaultStatePda,
        vault: vaultPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const ownerAfter = await provider.connection.getBalance(owner.publicKey);
    assert.isAbove(ownerAfter, ownerBefore);

    try {
      await program.account.vaultState.fetch(vaultStatePda);
      assert.fail("Account should be closed");
    } catch (err) {
      assert.include(err.toString(), "Account does not exist");
    }

    console.log("Close tx:", tx);
  });
});
