
"use client";

import { useEffect,useRef,useState } from "react";
import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import {
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import BN from "bn.js";
import { Buffer } from "buffer";

const WalletMultiButton = dynamic(
  async () => {
    const mod = await import("@solana/wallet-adapter-react-ui");
    return mod.WalletMultiButton;
  },
  { ssr: false }
);

import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

import { getStreamPayProgram } from "../lib/program";
import { STREAMPAY_PROGRAM_ID } from "../lib/streampay";

const TEST_TOKEN_MINT = new PublicKey(
  "3vKPq5oqWJHLykN3NDwS3XzeU3UsjsiyVJ83VH3BrJov"
);


const TOKEN_DECIMALS = 9;

type LoadedStream = {
  streamPda: string;
  streamId: string;
  employer: string;
  worker: string;
  totalAmount: string;
  withdrawnAmount: string;
  earnedAmount: string;
  startTime: number;
  endTime: number;
  isCancelled: boolean;
  status: string;
};

export default function Home() {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { publicKey, connected } = useWallet();

  const [workerAddress, setWorkerAddress] = useState("");
  const [streamId, setStreamId] = useState("1");
  const [totalAmount, setTotalAmount] = useState("");
  const [durationSeconds, setDurationSeconds] = useState("");
  const [timeRemaining, setTimeRemaining] = useState(""); 
  const [nowSeconds, setNowSeconds] = useState(
  Math.floor(Date.now() / 1000)
);
  const [employerAddress, setEmployerAddress] = useState(""); 


const [dashboardMode, setDashboardMode] =
  useState<"employer" | "worker">("employer");
  
const [isCreating, setIsCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("");
  const [loadedStream, setLoadedStream] =
  useState<LoadedStream | null>(null);

const [loadedStreams, setLoadedStreams] =
  useState<LoadedStream[]>([]);

  const [isLoadingStream, setIsLoadingStream] =
  useState(false);

const [notification, setNotification] =
  useState("");

const [notificationType, setNotificationType] =
  useState<
"start" | "success" | "cancel" | "withdraw"
>("success");

const previousStreamsRef =
  useRef<LoadedStream[] | null>(null);

const isRefreshingStreamsRef = useRef(false);

function getLiveEarnedAmount(stream: LoadedStream) {
  const total = Number(stream.totalAmount);

  if (stream.isCancelled) {
    return Number(stream.earnedAmount);
  }

  if (nowSeconds <= stream.startTime) {
    return 0;
  }

  if (nowSeconds >= stream.endTime) {
    return total;
  }

  const duration =
    stream.endTime - stream.startTime;

  if (duration <= 0) {
    return total;
  }

  const elapsed =
    nowSeconds - stream.startTime;

  const liveEarned =
    total * (elapsed / duration);

  return Math.min(
    total,
    Math.max(
      Number(stream.earnedAmount),
      liveEarned
    )
  );
}

  async function createStream() {
  if (!anchorWallet || !publicKey) {
    setMessage("Please connect your wallet first.");
    return;
  }
    
    try {
      setIsCreating(true);
      setMessage("");
      setSignature("");

if (!workerAddress.trim()) {
  setMessage(
    "Please enter the worker wallet address."
  );
  return;
}

let worker: PublicKey;

try {
  worker = new PublicKey(workerAddress.trim());
} catch {
  setMessage(
    "Please enter a valid Solana worker wallet address."
  );
  return;
}

const streamIdNumber = Number(streamId);
const amountNumber = Number(totalAmount);
const durationNumber = Number(durationSeconds);

if (
  !Number.isInteger(streamIdNumber) ||
  streamIdNumber <= 0
) {
  setMessage(
    "Stream ID must be a positive whole number."
  );
  return;
}

if (
  !Number.isInteger(amountNumber) ||
  amountNumber <= 0
) {
  setMessage(
    "For now, Total Amount must be a positive whole number."
  );
  return;
}

if (
  !Number.isInteger(durationNumber) ||
  durationNumber <= 0
) {
  setMessage(
    "Duration must be a positive whole number of seconds."
  );
  return;
}      

      const streamIdBn = new BN(streamId);
      const durationBn = new BN(durationSeconds);

      const tokenMultiplier = new BN(10).pow(
        new BN(TOKEN_DECIMALS)
      );

      const rawAmount = new BN(totalAmount).mul(
        tokenMultiplier
      );

      const streamIdBytes = streamIdBn.toArrayLike(
        Buffer,
        "le",
        8
      );

      const streamSeed = new TextEncoder().encode("stream");
      const escrowSeed = new TextEncoder().encode("escrow");

      const [streamPda] = PublicKey.findProgramAddressSync(
        [
          streamSeed,
          publicKey.toBytes(),
          worker.toBytes(),
          streamIdBytes,
        ],
        STREAMPAY_PROGRAM_ID
      );

       
// Check whether this stream already exists
const existingStreamAccount =
  await connection.getAccountInfo(streamPda);

if (existingStreamAccount) {
  setMessage(
    `Stream #${streamIdNumber} already exists for this worker. Please use a different Stream ID.`
  );
  return;
}

      const [escrowTokenAccount] =
        PublicKey.findProgramAddressSync(
          [
            escrowSeed,
            streamPda.toBytes(),
          ],
          STREAMPAY_PROGRAM_ID
        );

      const employerTokenAccount =
        getAssociatedTokenAddressSync(
          TEST_TOKEN_MINT,
          publicKey
        );

      const program = getStreamPayProgram(
        connection,
        anchorWallet
      );

      setMessage(
        "Please approve the transaction in your wallet..."
      );

const txSignature =
  await program.methods
    .createStream(
      streamIdBn,
      rawAmount,
      durationBn
    )
    .accounts({
      stream: streamPda,
      employer: publicKey,
      worker,
      tokenMint: TEST_TOKEN_MINT,
      employerTokenAccount,
      escrowTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

setSignature(txSignature);
setMessage("Salary stream created successfully!");

console.log("Stream PDA:", streamPda.toBase58());
console.log(
  "Escrow token account:",
  escrowTokenAccount.toBase58()
);
console.log(
  "Transaction signature:",
  txSignature
);

await loadWalletStreams(true);

    } catch (error) {
      console.error("Create stream error:", error);

      if (error instanceof Error) {
        setMessage(error.message);
      } else {
        setMessage("Something went wrong.");
      }
    } finally {
      setIsCreating(false);
    }
  }

  async function withdrawSalary() {
    if (!anchorWallet || !publicKey) {
      setMessage("Please connect your wallet first.");
      return;
    }

    try {
      setIsCreating(true);
      setMessage("");
      setSignature("");

      if (!loadedStream) {
  setMessage("Please load the stream first.");
  return;
}

const worker = publicKey;

if (worker.toBase58() !== loadedStream.worker) {
  setMessage(
    "Please connect the worker wallet to withdraw salary."
  );
  return;
}

if (loadedStream.isCancelled) {
  setMessage(
    "This stream was cancelled. Any earned salary was already paid automatically."
  );
  return;
}

const earnedAmount =
  getLiveEarnedAmount(loadedStream);

const withdrawnAmount =
  Number(loadedStream.withdrawnAmount);

const availableToWithdraw =
  Math.max(
    0,
    earnedAmount - withdrawnAmount
  );

if (availableToWithdraw <= 0) {
  setMessage(
    "There is no salary available to withdraw yet."
  );
  return;
}

const streamPda = new PublicKey(
  loadedStream.streamPda
);

const escrowSeed = new TextEncoder().encode("escrow");

      const [escrowTokenAccount] =
        PublicKey.findProgramAddressSync(
          [
            escrowSeed,
            streamPda.toBytes(),
          ],
          STREAMPAY_PROGRAM_ID
        );

      const workerTokenAccount =
        getAssociatedTokenAddressSync(
          TEST_TOKEN_MINT,
          worker
        );

      const program = getStreamPayProgram(
        connection,
        anchorWallet
      );

      setMessage(
        "Please approve the withdrawal in your wallet..."
      );

      const txSignature = await program.methods
        .withdraw()
        .accounts({
          stream: streamPda,
          worker,
          tokenMint: TEST_TOKEN_MINT,
          workerTokenAccount,
          escrowTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      setSignature(txSignature);
      setMessage("Salary withdrawn successfully!");

setNotificationType("withdraw");

setNotification(
  `Salary successfully withdrawn from Stream #${loadedStream.streamId}.`
);

      console.log(
        "Withdraw transaction:",
        txSignature
      );
await loadWalletStreams(true);
    } catch (error) {
      console.error("Withdraw error:", error);

      if (error instanceof Error) {
        setMessage(error.message);
      } else {
        setMessage("Withdrawal failed.");
      }
    } finally {
      setIsCreating(false);
    }
  }

async function cancelStream() {
  if (!anchorWallet || !publicKey) {
    setMessage("Please connect your wallet.");
    return;
  }

  try {
    setMessage("Cancelling stream...");
    setSignature("");

    const program = getStreamPayProgram(
      connection,
      anchorWallet
    );

    if (!loadedStream) {
  setMessage("Please load the stream first.");
  return;
}

const employer = publicKey;

if (employer.toBase58() !== loadedStream.employer) {
  setMessage(
    "Please connect the employer wallet to cancel this stream."
  );
  return;
}

const worker = new PublicKey(
  loadedStream.worker
);

const streamPda = new PublicKey(
  loadedStream.streamPda
);

    const [escrowTokenAccount] =
      PublicKey.findProgramAddressSync(
        [
          Buffer.from("escrow"),
          streamPda.toBuffer(),
        ],
        STREAMPAY_PROGRAM_ID
      );

    const employerTokenAccount =
      getAssociatedTokenAddressSync(
        TEST_TOKEN_MINT,
        employer
      );

    const workerTokenAccount =
      getAssociatedTokenAddressSync(
        TEST_TOKEN_MINT,
        worker
      );

const txSignature =
  await program.methods
    .cancelStream()
    .accounts({
      stream: streamPda,
      employer,
      worker,
      tokenMint: TEST_TOKEN_MINT,
      employerTokenAccount,
      workerTokenAccount,
      escrowTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();

setSignature(txSignature);
setMessage("Stream cancelled successfully!");

await loadWalletStreams();

  } catch (error) {
    console.error(error);

    if (error instanceof Error) {
      setMessage(error.message);
    } else {
      setMessage("Failed to cancel stream.");
    }
  }
}

  async function loadStream() {
    if (!anchorWallet || !publicKey) {
      setMessage("Please connect your wallet first.");
      return;
    }

    try {
      setIsLoadingStream(true);
      setMessage("");

      const streamIdBn = new BN(streamId);

      const streamIdBytes = streamIdBn.toArrayLike(
        Buffer,
        "le",
        8
      );

      // Our first test used the same wallet
      // as employer and worker.
     
 if (!employerAddress.trim()) {
  throw new Error("Please enter the employer wallet address.");
}

if (!workerAddress.trim()) {
  setMessage(
            "Please enter the worker wallet address.");
       return; 
}

const employer = new PublicKey(employerAddress.trim());
const worker = new PublicKey(workerAddress.trim());

      const [streamPda] = PublicKey.findProgramAddressSync(
        [
          new TextEncoder().encode("stream"),
          employer.toBytes(),
          worker.toBytes(),
          streamIdBytes,
        ],
        STREAMPAY_PROGRAM_ID
      );

      const program = getStreamPayProgram(
        connection,
        anchorWallet
      );

      const accountInfo =
        await connection.getAccountInfo(streamPda);

      if (!accountInfo) {
        throw new Error(
          `Stream ID ${streamId} was not found on Devnet.`
        );
      }

      const streamAccount = program.coder.accounts.decode(
        "stream",
        accountInfo.data
      ) as {
        employer: PublicKey;
        worker: PublicKey;
        tokenMint: PublicKey;
        streamId: BN;
        totalAmount: BN;
        withdrawnAmount: BN;
        isCancelled: boolean;
        startTime: BN;
        endTime: BN;
        bump: number;
      };

      const now = new BN(
        Math.floor(Date.now() / 1000)
      );

      const startTime = streamAccount.startTime;
      const endTime = streamAccount.endTime;
      const total = streamAccount.totalAmount;
        
let earned = new BN(0);

if (streamAccount.isCancelled) {
  // On cancellation, withdrawnAmount represents
  // the worker's final vested/earned amount.
  earned = streamAccount.withdrawnAmount;
} else if (now.lte(startTime)) {
  earned = new BN(0);
} else if (now.gte(endTime)) {
  earned = total;
} else {
  const elapsed = now.sub(startTime);
  const duration = endTime.sub(startTime);

  earned = total
    .mul(elapsed)
    .div(duration);
}
      function formatTokens(value: BN) {
        const raw = BigInt(value.toString());
        const divisor =
  BigInt(10) ** BigInt(TOKEN_DECIMALS);

        const whole = raw / divisor;
        const remainder = raw % divisor;

        if (remainder === BigInt(0)) {
          return whole.toString();
        }

        const decimals = remainder
          .toString()
          .padStart(TOKEN_DECIMALS, "0")
          .replace(/0+$/, "");

        return `${whole}.${decimals}`;
      }

      let status = "Active";

      if (streamAccount.isCancelled) {
        status = "Cancelled";
      } else if (now.gte(endTime)) {
        status = "Completed";
      }

      setLoadedStream({
        streamPda: streamPda.toBase58(),
         streamId: streamAccount.streamId.toString(),
         employer:

          streamAccount.employer.toBase58(),
        worker:
          streamAccount.worker.toBase58(),
        totalAmount:
          formatTokens(streamAccount.totalAmount),
        withdrawnAmount:
          formatTokens(
            streamAccount.withdrawnAmount
          ),
        earnedAmount: formatTokens(earned),
        startTime:
          streamAccount.startTime.toNumber(),
        endTime:
          streamAccount.endTime.toNumber(),
        isCancelled:
          streamAccount.isCancelled,
        status,
      });

      setMessage("Stream loaded successfully!");
    } catch (error) {
      console.error("Load stream error:", error);

  setLoadedStream(null);

  if (error instanceof Error) {
    setMessage(error.message);
  } else {
    setMessage("Could not load stream.");
  }
} finally {
  setIsLoadingStream(false);
}
  }

async function loadWalletStreams(silent = false) {
  if (!anchorWallet || !publicKey) {
    setMessage("Please connect your wallet first.");
    return;
  }

if (isRefreshingStreamsRef.current) {
  return;
}

isRefreshingStreamsRef.current = true;

  try {
    if (!silent) 
          {setIsLoadingStream(true);
    setMessage("");
     }
    const program = getStreamPayProgram(
      connection,
      anchorWallet
    );

    /*
      Stream account layout:

      0  - 7   = Anchor discriminator
      8  - 39  = employer
      40 - 71  = worker

      Employer mode searches offset 8.
      Worker mode searches offset 40.
    */
    const walletOffset =
      dashboardMode === "employer" ? 8 : 40;

    const accounts =
      await connection.getProgramAccounts(
        STREAMPAY_PROGRAM_ID,
        {
          filters: [
            {
              dataSize: 146,
            },
            {
              memcmp: {
                offset: walletOffset,
                bytes: publicKey.toBase58(),
              },
            },
          ],
        }
      );

    const now = new BN(
      Math.floor(Date.now() / 1000)
    );

    function formatTokens(value: BN) {
      const raw = BigInt(value.toString());

      const divisor =
        BigInt(10) ** BigInt(TOKEN_DECIMALS);

      const whole = raw / divisor;
      const remainder = raw % divisor;

      if (remainder === BigInt(0)) {
        return whole.toString();
      }

      const decimals = remainder
        .toString()
        .padStart(TOKEN_DECIMALS, "0")
        .replace(/0+$/, "");

      return `${whole}.${decimals}`;
    }

    const streams: LoadedStream[] =
      accounts.map(({ pubkey, account }) => {
        const streamAccount =
          program.coder.accounts.decode(
            "stream",
            account.data
          ) as {
            employer: PublicKey;
            worker: PublicKey;
            tokenMint: PublicKey;
            streamId: BN;
            totalAmount: BN;
            withdrawnAmount: BN;
            isCancelled: boolean;
            startTime: BN;
            endTime: BN;
            bump: number;
          };

        const startTime = streamAccount.startTime;
        const endTime = streamAccount.endTime;
        const total = streamAccount.totalAmount;

        let earned = new BN(0);

        if (streamAccount.isCancelled) {
          earned = streamAccount.withdrawnAmount;
        } else if (now.lte(startTime)) {
          earned = new BN(0);
        } else if (now.gte(endTime)) {
          earned = total;
        } else {
          const elapsed = now.sub(startTime);
          const duration = endTime.sub(startTime);

          earned = total
            .mul(elapsed)
            .div(duration);
        }

        let status = "Active";

        if (streamAccount.isCancelled) {
          status = "Cancelled";
        } else if (now.gte(endTime)) {
          status = "Completed";
        }

        return {
          streamPda: pubkey.toBase58(),
          streamId:
            streamAccount.streamId.toString(),
          employer:
            streamAccount.employer.toBase58(),
          worker:
            streamAccount.worker.toBase58(),
          totalAmount:
            formatTokens(
              streamAccount.totalAmount
            ),
          withdrawnAmount:
            formatTokens(
              streamAccount.withdrawnAmount
            ),
          earnedAmount:
            formatTokens(earned),
          startTime:
            streamAccount.startTime.toNumber(),
          endTime:
            streamAccount.endTime.toNumber(),
          isCancelled:
            streamAccount.isCancelled,
          status,
        };
      });

    streams.sort(
      (a, b) => b.startTime - a.startTime
    );

// Detect changes between blockchain refreshes
const previousStreams = previousStreamsRef.current;

if (previousStreams !== null) {
  for (const stream of streams) {
    const previousStream = previousStreams.find(
      (previous) =>
        previous.streamPda === stream.streamPda
    );

    // A brand-new stream appeared
    if (!previousStream) {
      if (dashboardMode === "worker") {
       setNotificationType("start");  
      setNotification(
          `New salary stream received — Stream #${stream.streamId}`
        );
      }

      continue;
    }

    // Active stream was cancelled
    if (
      previousStream.status !== "Cancelled" &&
      stream.status === "Cancelled"
    ) {
      const workerPayment =
        Number(stream.withdrawnAmount);

      const employerRefund = Math.max(
        0,
        Number(stream.totalAmount) -
          workerPayment
      );

      if (dashboardMode === "worker") {
        setNotificationType("cancel");
             setNotification(
          `Stream #${stream.streamId} cancelled — ${workerPayment.toFixed(
            9
          )} Tokens were automatically paid to your wallet.`
        );
      } else {
        setNotificationType("cancel");
          setNotification(
          `Stream #${stream.streamId} cancelled — ${workerPayment.toFixed(
            9
          )} Tokens paid to the worker and ${employerRefund.toFixed(
            9
          )} Tokens refunded to you.`
        );
      }

      continue;
    }

    // Stream reached its scheduled end
    if (
      previousStream.status === "Active" &&
      stream.status === "Completed"
    ) {
      
       setNotificationType("success");
       setNotification(
        `Stream #${stream.streamId} has completed.`
      );

      continue;
    }

    // Worker withdrew salary
    if (
      dashboardMode === "employer" &&
      stream.status !== "Cancelled" &&
      Number(stream.withdrawnAmount) >
        Number(previousStream.withdrawnAmount)
    ) {
      const withdrawnNow =
        Number(stream.withdrawnAmount) -
        Number(previousStream.withdrawnAmount);
setNotificationType("withdraw");

      setNotification(
        `Worker withdrew ${withdrawnNow.toFixed(
          9
        )} Tokens from Stream #${stream.streamId}.`
      );
    }
  }
}

// Save current blockchain state for the next refresh
previousStreamsRef.current = streams;

    setLoadedStreams(streams);

if (loadedStream) {
  const refreshedSelectedStream = streams.find(
    (stream) => stream.streamPda === loadedStream.streamPda
  );

  if (refreshedSelectedStream) {
    setLoadedStream(refreshedSelectedStream);
  }
}

if (!silent) {
    if (streams.length === 0) {
      setMessage(
        dashboardMode === "employer"
          ? "No salary streams created by this wallet yet."
          : "No salary streams found for this worker wallet yet."
      );
    } else {
      setMessage(
        `Found ${streams.length} salary ${
          streams.length === 1
            ? "stream"
            : "streams"
        }.`
      );
     }   
    }
  } catch (error) {
    console.error(
      "Load wallet streams error:",
      error
    );

    setLoadedStreams([]);

    if (error instanceof Error) {
      setMessage(error.message);
    } else {
      setMessage(
        "Could not load wallet streams."
      );
    }
  } finally {
 isRefreshingStreamsRef.current = false;
   if (!silent) {
    setIsLoadingStream(false);
  }
}
}
  useEffect(() => {
    if (!loadedStream) {
      setTimeRemaining("");
      return;
    }

    const updateTimeRemaining = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = loadedStream.endTime - now;

      if (loadedStream.isCancelled) {
        setTimeRemaining("Cancelled");
        return;
      }

      if (remaining <= 0) {
        setTimeRemaining("Completed");
        return;
      }

      const hours = Math.floor(remaining / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      const seconds = remaining % 60;

      if (hours > 0) {
        setTimeRemaining(
          `${hours}h ${minutes}m ${seconds}s`
        );
      } else {
        setTimeRemaining(
          `${minutes}m ${seconds}s`
        );
      }
    };

    updateTimeRemaining();

    const interval = setInterval(
      updateTimeRemaining,
      1000
    );

    return () => clearInterval(interval);
  }, [loadedStream]);

useEffect(() => {
  const interval = setInterval(() => {
    setNowSeconds(
      Math.floor(Date.now() / 1000)
    );
  }, 1000);

  return () => clearInterval(interval);
}, []);

useEffect(() => {
  previousStreamsRef.current = null;
  setNotification("");
  setLoadedStream(null);
}, [publicKey, dashboardMode]);

useEffect(() => {
  if (!anchorWallet || !publicKey) {
    return;
  }

  const refreshStreams = () => {
    loadWalletStreams(true);
  };

  refreshStreams();

  const interval = setInterval(
    refreshStreams,
    10000
  );

  return () => clearInterval(interval);

  }, [
    anchorWallet,
    publicKey,
    dashboardMode,
  ]);

  useEffect(() => {
    if (!notification) {
      return;
    }

const soundMap = {
  start: "/sounds/stream-start.mp3",
  success: "/sounds/success.mp3",
  cancel: "/sounds/stream-cancel.mp3",
  withdraw: "/sounds/withdraw.wav",
};

const audio = new Audio(
  soundMap[notificationType]
);    


    audio.volume = 0.45;

    audio.play().catch((error) => {
      console.log(
        "Notification sound could not play:",
        error
      );
    });

    const timeout = setTimeout(() => {
      setNotification("");
    }, 8000);

    return () => {
      clearTimeout(timeout);
      audio.pause();
    };
  }, [notification, notificationType]);

  return (
  
      <main className="min-h-screen bg-[#080c14] text-slate-100">
{notification && (
  <div className="fixed right-5 top-5 z-[100] w-[calc(100%-2.5rem)] max-w-md">
    <div className="rounded-2xl border border-emerald-400/20 bg-[#101620]/95 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-sm font-bold text-emerald-300">
          SP
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">
            StreamPay notification
          </p>

          <p className="mt-1 text-sm leading-5 text-slate-400">
            {notification}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setNotification("")}
          className="shrink-0 rounded-lg px-2 py-1 text-sm text-slate-500 transition hover:bg-white/[0.05] hover:text-white"
          aria-label="Close notification"
        >
          ×
        </button>
      </div>
    </div>
  </div>
)}  

{/* Top navigation */}
  <nav className="border-b border-white/[0.07] bg-[#0b1018]/95">
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-8">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/[0.08] text-lg font-bold text-emerald-400">
          S
        </div>

        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight text-white">
              StreamPay
            </h1>

            <span className="rounded-full border border-emerald-400/15 bg-emerald-400/[0.07] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
              Devnet
            </span>
          </div>

          <p className="mt-0.5 text-xs text-slate-500">
            On-chain salary streaming
          </p>
        </div>
      </div>

      {/* Dashboard switch */}
      <div className="flex w-full rounded-xl border border-white/[0.07] bg-white/[0.025] p-1 lg:w-auto">
        <button
          type="button"
          onClick={() => {
            setDashboardMode("employer");
            setLoadedStream(null);
          }}
          className={`flex-1 rounded-lg px-5 py-2.5 text-sm font-semibold transition lg:flex-none ${
            dashboardMode === "employer"
              ? "bg-emerald-500 text-[#04110d]"
              : "text-slate-400 hover:bg-white/[0.04] hover:text-white"
          }`}
        >
          Employer Dashboard
        </button>

        <button
          type="button"
          onClick={() => {
            setDashboardMode("worker");
            setLoadedStream(null);
          }}
          className={`flex-1 rounded-lg px-5 py-2.5 text-sm font-semibold transition lg:flex-none ${
            dashboardMode === "worker"
              ? "bg-emerald-500 text-[#04110d]"
              : "text-slate-400 hover:bg-white/[0.04] hover:text-white"
          }`}
        >
          Worker Dashboard
        </button>
      </div>

      {/* Network + wallet */}
      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-xs text-slate-400 sm:flex">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Solana Devnet
        </div>

        <WalletMultiButton />
      </div>
    </div>
  </nav>

  <div className="mx-auto max-w-[1440px] px-5 pb-20 pt-8 lg:px-8">
    {/* Page introduction */}
    <div className="mb-8 flex flex-col gap-3 border-b border-white/[0.06] pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
          {dashboardMode === "employer"
            ? "Employer workspace"
            : "Worker workspace"}
        </p>

        <h2 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          {dashboardMode === "employer"
            ? "Manage salary streams"
            : "Your streamed salary"}
        </h2>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          {dashboardMode === "employer"
            ? "Create and manage secure on-chain salary streams for your team."
            : "Track salary as it accrues and withdraw earned funds from active streams."}
        </p>
      </div>

      {/* Connected wallet summary */}
      <div className="min-w-0 rounded-xl border border-white/[0.07] bg-[#101620] px-4 py-3 sm:max-w-[320px]">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              connected ? "bg-emerald-400" : "bg-amber-400"
            }`}
          />

          <span className="text-xs font-medium text-slate-400">
            {connected ? "Wallet connected" : "Wallet not connected"}
          </span>
        </div>

        <p className="mt-1 truncate font-mono text-xs text-slate-300">
          {publicKey
            ? publicKey.toBase58()
            : "Connect your wallet to continue"}
        </p>
      </div>
    </div>

    {/* Global transaction message */}
    {message && (
      <div className="mb-6 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.045] px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-400" />

          <div className="min-w-0">
            <p className="text-sm text-slate-200">
              {message}
            </p>

            {signature && (
              <p className="mt-1.5 break-all font-mono text-xs text-emerald-400">
                Transaction: {signature}
              </p>
            )}
          </div>
        </div>
      </div>
    )}
  
      {/* Main dashboard */}
      <section className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        {/* Employer card */}

{dashboardMode === "employer" && (
  <div className="rounded-2xl border border-white/[0.07] bg-[#101620] p-6 shadow-xl shadow-black/20 sm:p-7">
    <div className="mb-7">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
        Employer
      </p>

      <h3 className="mt-2 text-2xl font-bold text-white">
        Create Salary Stream
      </h3>

      <p className="mt-2 text-sm leading-6 text-slate-400">
        Fund a secure on-chain escrow and stream salary continuously to a worker.
      </p>
    </div>

    <div className="space-y-5">
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-300">
          Worker Wallet Address
        </label>

        <input
          type="text"
          value={workerAddress}
          onChange={(e) => setWorkerAddress(e.target.value)}
          placeholder="Enter worker Solana wallet"
          className="w-full rounded-xl border border-white/[0.08] bg-[#0b1018] px-4 py-3.5 font-mono text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.08]"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">
            Stream ID
          </label>

          <input
            type="number"
            value={streamId}
            onChange={(e) => setStreamId(e.target.value)}
            min="1"
            step="1"
            className="w-full rounded-xl border border-white/[0.08] bg-[#0b1018] px-4 py-3.5 text-white outline-none transition focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.08]"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-300">
            Total Salary
          </label>

          <div className="relative">
            <input
              type="number"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              placeholder="100"
              min="1"
              step="1"
              className="w-full rounded-xl border border-white/[0.08] bg-[#0b1018] px-4 py-3.5 pr-20 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.08]"
            />

            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500">
              TOKENS
            </span>
          </div>
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-300">
          Stream Duration
        </label>

        <div className="relative">
          <input
            type="number"
            value={durationSeconds}
            onChange={(e) => setDurationSeconds(e.target.value)}
            placeholder="3600"
            min="1"
            step="1"
            className="w-full rounded-xl border border-white/[0.08] bg-[#0b1018] px-4 py-3.5 pr-24 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.08]"
          />

          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500">
            SECONDS
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-[#0b1018] p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Escrow
            </p>

            <p className="mt-1 text-sm text-slate-300">
              Salary is held securely on-chain
            </p>
          </div>

          <span className="rounded-lg border border-emerald-400/15 bg-emerald-400/[0.06] px-3 py-1.5 text-xs font-semibold text-emerald-300">
            Protected
          </span>
        </div>

        <div className="mt-4 border-t border-white/[0.06] pt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">
              Salary accrual
            </span>

            <span className="font-medium text-slate-300">
              Continuous
            </span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={createStream}
        disabled={!connected || isCreating}
        className="w-full rounded-xl bg-emerald-500 px-5 py-3.5 font-semibold text-[#04110d] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isCreating
          ? "Creating Salary Stream..."
          : "Create Salary Stream"}
      </button>

      <p className="text-center text-xs leading-5 text-slate-500">
        The connected employer wallet will approve the transaction on Solana Devnet.
      </p>
    </div>
  </div>
)}

{/* Stream dashboard */}
<div
  className={`rounded-2xl border border-white/[0.07] bg-[#101620] p-6 shadow-xl shadow-black/20 sm:p-7 ${
    dashboardMode === "worker"
      ? "lg:col-span-2"
      : ""
  }`}
>
  <div>
    <div className="mb-7 flex flex-col gap-4 border-b border-white/[0.06] pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
          {dashboardMode === "employer"
            ? "Payroll streams"
            : "Salary streams"}
        </p>

        <h3 className="mt-2 text-2xl font-bold tracking-tight text-white">
          {dashboardMode === "employer"
            ? "Employee Salary Streams"
            : "My Salary Streams"}
        </h3>

        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
          {dashboardMode === "employer"
            ? "Monitor active payroll streams, review employee earnings and manage salary payments."
            : "Monitor salary from your employers and withdraw funds as they become available."}
        </p>
      </div>

      <div className="rounded-lg border border-white/[0.06] bg-[#0b1018] px-3 py-2">
        <p className="text-xs text-slate-500">
          Streams found
        </p>

        <p className="mt-0.5 text-lg font-bold text-white">
          {loadedStreams.length}
        </p>
      </div>
    </div>

    {/* Wallet stream list */}
    <div
      className={
        dashboardMode === "worker"
          ? "grid gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-start"
          : ""
      }
    >
<div className="rounded-2xl border border-white/[0.07] bg-[#0b1018] p-5">
  <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
        {dashboardMode === "employer"
          ? "Employee payroll"
          : "Salary overview"}
      </p>

      <h4 className="mt-2 text-lg font-bold text-white">
        {dashboardMode === "employer"
          ? "Employee Salary Streams"
          : "My Salary Streams"}
      </h4>

      <p className="mt-1 text-sm text-slate-500">
        {loadedStreams.length}{" "}
        {loadedStreams.length === 1
          ? "stream"
          : "streams"}{" "}
        found on Solana Devnet
      </p>
    </div>

    <div className="flex items-center gap-2">
  {/* Automatic synchronization indicator */}
  <div className="flex items-center gap-2 rounded-lg border border-emerald-400/10 bg-emerald-400/[0.04] px-3 py-2">
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
    </span>

    <span className="text-xs font-semibold text-emerald-300">
      Live · Auto-sync
    </span>
  </div>

  {/* Manual fallback refresh */}
  <button
    type="button"
    onClick={() => loadWalletStreams(false)}
    disabled={!connected || isLoadingStream}
    title="Refresh streams manually"
    aria-label="Refresh streams manually"
    className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-base text-slate-400 transition hover:border-emerald-400/20 hover:bg-emerald-400/[0.06] hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
  >
    <span
      className={
        isLoadingStream
          ? "inline-block animate-spin"
          : "inline-block"
      }
    >
      ↻
    </span>
  </button>
</div>
  </div>

        
  {loadedStreams.length === 0 ? (
    <div className="rounded-xl border border-dashed border-white/10 p-6 text-center">
      <p className="text-sm text-slate-400">
        {dashboardMode === "employer"
          ? "No employee streams loaded yet."
          : "No salary streams loaded yet."}
      </p>
    </div>
  ) : (
    <div className="space-y-3">
      {loadedStreams.map((stream) => {
        const total = Number(stream.totalAmount);
        const earned = Number(stream.earnedAmount);

        const progress =
          total > 0
            ? Math.min(
                100,
                Math.max(0, (earned / total) * 100)
              )
            : 0;

        return (
          <div
  key={stream.streamPda}
  className="rounded-xl border border-white/[0.07] bg-[#101620] p-5 transition hover:border-emerald-400/20 hover:bg-[#121a25]"
>
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-base font-bold text-white">
  Stream #{stream.streamId}
</p>

                 <p className="mt-2 text-xs font-medium uppercase tracking-wider text-slate-500">
  {dashboardMode === "employer"
    ? "Worker wallet"
    : "Employer wallet"}
</p>   
                  
                  <p className="mt-1 max-w-[260px] truncate font-mono text-xs text-slate-500">
                    {dashboardMode === "employer"
                      ? stream.worker
                      : stream.employer}
                  </p>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    stream.status === "Active"
                      ? "bg-emerald-400/10 text-emerald-300"
                      : stream.status === "Cancelled"
                        ? "bg-red-400/10 text-red-300"
                        : "bg-cyan-400/10 text-cyan-300"
                  }`}
                >
                  {stream.status}
                </span>
              </div>

<div className="grid grid-cols-3 gap-3 border-y border-white/[0.06] py-4">
  <div>
    <p className="text-xs text-slate-500">
      Total Salary
    </p>

    <p className="mt-1 text-sm font-bold text-white">
      {stream.totalAmount}
    </p>

    <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-600">
      Tokens
    </p>
  </div>

  <div>
    <p className="text-xs text-slate-500">
      Earned
    </p>

    <p className="mt-1 text-sm font-bold text-emerald-300">
      {getLiveEarnedAmount(stream).toFixed(9)}
    </p>

    <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-600">
      Tokens
    </p>
  </div>

  <div>
    <p className="text-xs text-slate-500">
      Withdrawn
    </p>

    <p className="mt-1 text-sm font-bold text-slate-200">
      {stream.withdrawnAmount}
    </p>

    <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-600">
      Tokens
    </p>
  </div>
</div>
              
              <div>
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="text-slate-500">
                    Salary progress
                  </span>

                  <span className="font-medium text-cyan-300">
                    {progress.toFixed(0)}%
                  </span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700"
                    
                  style={{
                        width: `${Math.min(
                                         100,
                            (getLiveEarnedAmount(stream) /
                                Number(stream.totalAmount)) *
                                    100
                                  )}%`,

                    }}
                  />
                </div>
              </div>

<button
  type="button"
  onClick={() => {
    if (
      loadedStream?.streamPda ===
      stream.streamPda
    ) {
      setLoadedStream(null);
      setMessage("");
    } else {
      setLoadedStream(stream);
      setMessage(
        `Stream #${stream.streamId} selected.`
      );
    }
  }}
  className="flex w-full items-center justify-between rounded-lg border border-white/[0.07] bg-[#0b1018] px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-emerald-400/20 hover:bg-emerald-400/[0.04] hover:text-emerald-300"
>  
<span>

    {dashboardMode === "employer" &&
loadedStream?.streamPda ===
    stream.streamPda
      ? "Hide Details"
      : "View Details"}
  </span>
<span className="text-xs text-slate-500">
  {loadedStream?.streamPda === stream.streamPda
    ? "Close"
    : "Details"}
</span>
  
</button>
        
{dashboardMode === "employer" &&
  loadedStream?.streamPda === stream.streamPda && (
  <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.07] bg-[#0b1018] p-5">
    {/* Detail header */}
    <div className="flex flex-col gap-4 border-b border-white/[0.07] pb-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
          Stream Details
        </p>

        <h4 className="mt-2 text-xl font-bold text-white">
          Salary Stream #{stream.streamId}
        </h4>
      </div>

      <span
        className={`w-fit rounded-full border px-3 py-1.5 text-xs font-semibold ${
          stream.status === "Active"
            ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
            : stream.status === "Cancelled"
              ? "border-red-400/20 bg-red-400/10 text-red-300"
              : "border-blue-400/20 bg-blue-400/10 text-blue-300"
        }`}
      >
        {stream.status}
      </span>
    </div>

    {/* Wallet information */}
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
        <p className="text-xs uppercase tracking-wider text-slate-500">
          Employer
        </p>

        <p className="mt-2 break-all font-mono text-xs leading-5 text-slate-300">
          {stream.employer}
        </p>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
        <p className="text-xs uppercase tracking-wider text-slate-500">
          Worker
        </p>

        <p className="mt-2 break-all font-mono text-xs leading-5 text-slate-300">
          {stream.worker}
        </p>
      </div>
    </div>

    {/* Financial stats */}
    <div className="mt-3 grid grid-cols-2 gap-3">
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
        <p className="text-xs text-slate-500">
          Total salary
        </p>

        <p className="mt-2 text-lg font-bold text-white">
          {stream.totalAmount}{" "}
<span className="text-xs font-medium text-slate-500">
  Tokens
</span>
        </p>
      </div>

      <div className="rounded-xl border border-emerald-400/10 bg-emerald-400/[0.04] p-4">
        <p className="text-xs text-slate-500">
          Earned
        </p>

        <p className="mt-2 break-all text-base font-bold text-emerald-300">
          {stream.earnedAmount}{" "}
<span className="text-xs font-medium text-slate-500">
  Tokens
</span>
        </p>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
        <p className="text-xs text-slate-500">
          Withdrawn
        </p>

        <p className="mt-2 break-all text-base font-bold text-slate-200">
          {stream.withdrawnAmount}{" "}
<span className="text-xs font-medium text-slate-500">
  Tokens
</span>
        </p>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
        <p className="text-xs text-slate-500">
          In escrow
        </p>

        <p className="mt-2 text-lg font-bold text-teal-300">
          {stream.status === "Cancelled"
            ? "0"
            : Math.max(
                0,
                Number(stream.totalAmount) -
                  Number(stream.withdrawnAmount)
              ).toString()}
        </p>
      </div>
    </div>

    {/* Progress */}
    <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/20 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">
          Salary streamed
        </span>

        <span className="text-sm font-bold text-emerald-300">
          {progress.toFixed(0)}%
        </span>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700"
          style={{
            width: `${progress}%`,
          }}
        />
      </div>
    </div>

    {/* Time */}
    <div className="mt-3 grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
        <p className="text-xs text-slate-500">
          Start
        </p>

        <p className="mt-2 text-sm font-medium text-slate-200">
          {new Date(
            stream.startTime * 1000
          ).toLocaleString()}
        </p>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
        <p className="text-xs text-slate-500">
          End
        </p>

        <p className="mt-2 text-sm font-medium text-slate-200">
          {new Date(
            stream.endTime * 1000
          ).toLocaleString()}
        </p>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
        <p className="text-xs text-slate-500">
          Time remaining
        </p>

        <p className="mt-2 text-sm font-bold text-amber-300">
          {timeRemaining}
        </p>
      </div>
    </div>

    {/* Stream PDA */}
    <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/20 p-4">
      <p className="text-xs uppercase tracking-wider text-slate-500">
        Stream PDA
      </p>

      <p className="mt-2 break-all font-mono text-xs leading-5 text-slate-400">
        {stream.streamPda}
      </p>
    </div>

    {/* Role */}
    {publicKey && (
      <div className="mt-3 flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
        <span className="text-sm text-slate-500">
          Your role
        </span>

        <span className="rounded-full bg-white/[0.06] px-3 py-1 text-sm font-semibold text-slate-200">
          {publicKey.toBase58() ===
          stream.employer
            ? "Employer"
            : publicKey.toBase58() ===
                stream.worker
              ? "Worker"
              : "Viewer"}
        </span>
      </div>
    )}

    
{/* Employer action */}
{publicKey &&
  publicKey.toBase58() === stream.employer &&
  stream.status === "Active" && (
    <div className="mt-5 border-t border-white/[0.06] pt-5">
      <button
        type="button"
        onClick={cancelStream}
        disabled={!connected || isCreating}
        className="w-full rounded-xl border border-red-400/20 bg-red-500/[0.06] px-5 py-3.5 font-semibold text-red-300 transition hover:border-red-400/30 hover:bg-red-500/[0.1] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isCreating
          ? "Processing..."
          : "Cancel Salary Stream"}
      </button>

      <p className="mt-3 text-center text-xs leading-5 text-slate-500">
        Cancelling sends the worker their earned salary and returns the
        unearned balance to the employer.
      </p>
    </div>
  )}

{stream.status === "Cancelled" && (
  <div className="mt-5 rounded-xl border border-red-400/15 bg-red-500/[0.04] p-4">
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-red-300">
          Salary Stream Cancelled
        </p>

        <p className="mt-1 text-xs leading-5 text-slate-500">
          Earned salary was paid to the worker and the remaining balance
          was returned to the employer.
        </p>
      </div>

      <span className="shrink-0 rounded-full border border-red-400/15 bg-red-400/[0.06] px-3 py-1 text-xs font-semibold text-red-300">
        Cancelled
      </span>
    </div>

    <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-4">
      <span className="text-xs text-slate-500">
        Remaining in Escrow
      </span>

      <span className="text-sm font-bold text-white">
        0 Tokens
      </span>
    </div>
  </div>
)}

{stream.status === "Completed" && (
  <div className="mt-5 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4">
    <p className="text-sm font-semibold text-emerald-300">
      Salary Stream Completed
    </p>

    <p className="mt-1 text-xs leading-5 text-slate-500">
      The scheduled salary streaming period has finished.
    </p>
  </div>
)}    

  </div>
)}
            </div>
          </div>
        );
      })}
    </div>
  )}
</div>
       {dashboardMode === "worker" && (
  <div className="rounded-2xl border border-white/[0.07] bg-[#0b1018] p-6 shadow-xl shadow-black/20">
    {!loadedStream ? (
      <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.07] bg-[#101620] text-sm font-bold text-emerald-300">
  SP
</div>

        <h4 className="mt-5 text-lg font-bold text-white">
          Select a salary stream
        </h4>

        <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">
          Choose a stream from the list to view your earnings,
          schedule and withdrawal details.
        </p>
      </div>
    ) : (
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] pb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
              Selected Stream
            </p>

            <h4 className="mt-2 text-xl font-bold text-white">
              Salary Stream #{loadedStream.streamId}
            </h4>

            <p className="mt-2 text-sm text-slate-400">
              Salary streamed directly from your employer.
            </p>
          </div>

          <span
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              loadedStream.status === "Active"
                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                : loadedStream.status === "Cancelled"
                  ? "border-red-400/20 bg-red-400/10 text-red-300"
                  : "border-blue-400/20 bg-blue-400/10 text-blue-300"
            }`}
          >
            {loadedStream.status}
          </span>
        </div>

        {/* Employer */}
        <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Employer
          </p>

          <p className="mt-2 break-all font-mono text-xs leading-5 text-slate-300">
            {loadedStream.employer}
          </p>
        </div>

        {/* Financial summary */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
            <p className="text-xs text-slate-500">
              Total salary
            </p>

<p className="mt-2 break-all text-base font-bold text-white">
  {loadedStream.totalAmount}{" "}
  <span className="text-xs font-medium text-slate-500">
    Tokens
  </span>
</p>            

          </div>

          <div className="rounded-xl border border-emerald-400/10 bg-emerald-400/[0.04] p-4">
            <p className="text-xs text-slate-500">
              Earned
            </p>

            <p className="mt-2 break-all text-base font-bold text-emerald-300">
             {getLiveEarnedAmount(loadedStream).toFixed(9)}  {" "}
<span className="text-xs font-medium text-slate-500">
  Tokens
</span> 
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
            <p className="text-xs text-slate-500">
              Withdrawn
            </p>

            <p className="mt-2 break-all text-base font-bold text-slate-200">
              {loadedStream.withdrawnAmount}{" "}
<span className="text-xs font-medium text-slate-500">
  Tokens
</span>
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
            <p className="text-xs text-slate-500">
              In escrow
            </p>

<p className="mt-2 break-all text-base font-bold text-teal-300">
  {loadedStream.status === "Cancelled"
    ? "0"
    : Math.max(
        0,
        Number(loadedStream.totalAmount) -
          Number(loadedStream.withdrawnAmount)
      ).toString()}{" "}
  <span className="text-xs font-medium text-slate-500">
    Tokens
  </span>
</p>            

          </div>
        </div>

        {/* Salary progress */}
        <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/20 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">
              Salary streamed
            </span>

            <span className="text-sm font-bold text-emerald-300">
              {Math.min(
                100,
                Math.max(
                  0,
                  (getLiveEarnedAmount(loadedStream)  /
                    Math.max(
                      Number(loadedStream.totalAmount),
                      1
                    )) *
                    100
                )
              ).toFixed(0)}
              %
            </span>
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700"
              style={{
                width: `${Math.min(
                  100,
                  Math.max(
                    0,
                    (getLiveEarnedAmount(loadedStream) /
                      Math.max(
                        Number(loadedStream.totalAmount),
                        1
                      )) *
                      100
                  )
                )}%`,
              }}
            />
          </div>
        </div>

        {/* Timing */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
            <p className="text-xs text-slate-500">
              Start
            </p>

            <p className="mt-2 text-sm font-medium text-slate-200">
              {new Date(
                loadedStream.startTime * 1000
              ).toLocaleString()}
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
            <p className="text-xs text-slate-500">
              End
            </p>

            <p className="mt-2 text-sm font-medium text-slate-200">
              {new Date(
                loadedStream.endTime * 1000
              ).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
          <span className="text-sm text-slate-500">
            Time remaining
          </span>

          <span className="text-sm font-bold text-amber-300">
            {timeRemaining}
          </span>
        </div>

        {/* Stream PDA */}
        <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/20 p-4">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            Stream PDA
          </p>

          <p className="mt-2 break-all font-mono text-xs leading-5 text-slate-400">
            {loadedStream.streamPda}
          </p>
        </div>

{/* Worker action */}
{publicKey &&
  publicKey.toBase58() === loadedStream.worker &&
  loadedStream.status !== "Cancelled" &&
  Number(loadedStream.withdrawnAmount) <
    Number(loadedStream.totalAmount) && (
    <div className="mt-5 border-t border-white/[0.06] pt-5">
      {(() => {
        const availableToWithdraw = Math.max(
          0,
          getLiveEarnedAmount(loadedStream) -
            Number(loadedStream.withdrawnAmount)
        );

        const canWithdraw =
          availableToWithdraw > 0;

        return (
          <>
            <button
              type="button"
              onClick={withdrawSalary}
              disabled={
                !connected ||
                isCreating ||
                !canWithdraw
              }
              className="w-full rounded-xl bg-emerald-500 px-5 py-3.5 font-semibold text-[#03100c] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isCreating
                ? "Processing..."
                : canWithdraw
                  ? `Withdraw ${availableToWithdraw.toFixed(
                      9
                    )} Tokens`
                  : "Nothing to Withdraw Yet"}
            </button>

            <p className="mt-3 text-center text-xs leading-5 text-slate-500">
              {canWithdraw
                ? "Withdraw the salary that has already vested to your wallet."
                : "Your salary is streaming. More will become available automatically."}
            </p>
          </>
        );
      })()}
    </div>
  )}

{loadedStream.status === "Cancelled" && (
  <div className="mt-5 rounded-xl border border-red-400/15 bg-red-500/[0.04] p-4">
    <p className="text-sm font-semibold text-red-300">
      Salary Stream Cancelled
    </p>

    <p className="mt-1 text-xs leading-5 text-slate-500">
      Your earned salary was released when the employer cancelled this stream.
    </p>
  </div>
)}

{loadedStream.status === "Completed" && (
  <div className="mt-5 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4">
    <p className="text-sm font-semibold text-emerald-300">
      Salary Stream Completed
    </p>

    <p className="mt-1 text-xs leading-5 text-slate-500">
      The scheduled salary streaming period has finished.
    </p>
  </div>
)}
     
      </div>
    )}
  </div>
)}
</div>      
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-14 border-t border-white/10 pt-8">
        <div className="flex flex-col gap-3 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p>
            StreamPay • Programmable payroll infrastructure
          </p>

          <p>
            Built on Solana • Devnet
          </p>
        </div>
      </footer>
    </div>
  </main>
);
}
