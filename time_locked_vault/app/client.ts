import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TimeLockedVault } from "../target/types/time_locked_vault";
import { PublicKey, LAMPORTS_PER_SOL, Connection, Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const keypairPath = `${os.homedir()}/.config/solana/id.json`;
const secret = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
const wallet = new anchor.Wallet(Keypair.fromSecretKey(Uint8Array.from(secret)));
const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);

const program = anchor.workspace.timeLockedVault as Program<TimeLockedVault>;

const [vaultStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("state"), wallet.publicKey.toBuffer()],
    program.programId
);
const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), vaultStatePda.toBuffer()],
    program.programId
);

const accounts = {
    owner: wallet.publicKey,
    vaultState: vaultStatePda,
    vault: vaultPda,
    systemProgram: anchor.web3.SystemProgram.programId,
};

async function initialize(lockSeconds: number) {
    console.log(`\nInitializing vault with ${lockSeconds}s lock...\n`);
    const tx = await program.methods
        .initialize(new anchor.BN(lockSeconds))
        .accountsPartial(accounts)
        .rpc();
    console.log(`Done! Tx: ${tx}`);
    console.log(`Vault State: ${vaultStatePda.toBase58()}`);
    console.log(`Vault PDA:   ${vaultPda.toBase58()}`);
}

async function deposit(solAmount: number) {
    const lamports = solAmount * LAMPORTS_PER_SOL;
    console.log(`\nDepositing ${solAmount} SOL...\n`);
    const tx = await program.methods
        .deposit(new anchor.BN(lamports))
        .accountsPartial(accounts)
        .rpc();
    console.log(`Done! Tx: ${tx}`);
    await status();
}

async function withdraw(solAmount: number) {
    const lamports = solAmount * LAMPORTS_PER_SOL;
    console.log(`\nWithdrawing ${solAmount} SOL...\n`);
    const tx = await program.methods
        .withdraw(new anchor.BN(lamports))
        .accountsPartial(accounts)
        .rpc();
    console.log(`Done! Tx: ${tx}`);
    await status();
}

async function close() {
    console.log(`\nClosing vault...\n`);
    const tx = await program.methods
        .close()
        .accountsPartial(accounts)
        .rpc();
    console.log(`Done! Vault closed. Rent reclaimed.`);
    console.log(`Tx: ${tx}`);
}

async function status() {
    try {
        const state = await program.account.vaultState.fetch(vaultStatePda);
        const vaultBalance = await connection.getBalance(vaultPda);
        const now = Math.floor(Date.now() / 1000);
        const unlockAt = state.depositTimestamp.toNumber() + state.lockDuration.toNumber();
        const remaining = unlockAt - now;

        console.log(`\n--- Vault Status ---`);
        console.log(`Owner:        ${state.owner.toBase58()}`);
        console.log(`Deposited:    ${state.amountDeposited.toNumber() / LAMPORTS_PER_SOL} SOL`);
        console.log(`Vault Balance:${vaultBalance / LAMPORTS_PER_SOL} SOL`);
        console.log(`Lock Duration:${state.lockDuration.toNumber()}s`);
        if (state.depositTimestamp.toNumber() === 0) {
            console.log(`Lock Status:  No deposit yet`);
        } else if (remaining > 0) {
            console.log(`Lock Status:  LOCKED (${remaining}s remaining)`);
        } else {
            console.log(`Lock Status:  UNLOCKED ✓`);
        }
        console.log(`--------------------\n`);
    } catch {
        console.log(`\nNo vault found for this wallet. Run: init <seconds>\n`);
    }
}

const [, , command, arg] = process.argv;

(async () => {
    try {
        switch (command) {
            case "init":
                await initialize(parseInt(arg) || 60);
                break;
            case "deposit":
                await deposit(parseFloat(arg) || 0.1);
                break;
            case "withdraw":
                await withdraw(parseFloat(arg) || 0.1);
                break;
            case "close":
                await close();
                break;
            case "status":
                await status();
                break;
            default:
                console.log(`
  Time-Locked Vault CLI
  
  Usage:
    ts-node app/client.ts init <lock_seconds>    Initialize vault (e.g. init 30)
    ts-node app/client.ts deposit <sol_amount>   Deposit SOL (e.g. deposit 0.5)
    ts-node app/client.ts withdraw <sol_amount>  Withdraw SOL (e.g. withdraw 0.5)
    ts-node app/client.ts close                  Close vault & reclaim rent
    ts-node app/client.ts status                 Check vault status
        `);
        }
    } catch (err: any) {
        if (err.logs) {
            const errorLog = err.logs.find((l: string) => l.includes("Error Message"));
            console.error(`\nFailed: ${errorLog || err.message}\n`);
        } else {
            console.error(`\nFailed: ${err.message}\n`);
        }
    }
})();
