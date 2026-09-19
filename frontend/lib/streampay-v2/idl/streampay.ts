/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/streampay.json`.
 */
export type Streampay = {
  "address": "EgZvP1pnkQFiCQkrqvEUQQLJa1hGg6UUYUUcVCZMEyhd",
  "metadata": {
    "name": "streampay",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "acceptContract",
      "docs": [
        "Freelancer accepts a funded offer. Does not start the main stream."
      ],
      "discriminator": [
        217,
        254,
        164,
        16,
        244,
        59,
        30,
        81
      ],
      "accounts": [
        {
          "name": "freelancer",
          "signer": true,
          "relations": [
            "contract"
          ]
        },
        {
          "name": "contract",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  97,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "contract.employer",
                "account": "contract"
              },
              {
                "kind": "account",
                "path": "freelancer"
              },
              {
                "kind": "account",
                "path": "contract.contractId",
                "account": "contract"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "addMilestone",
      "docs": [
        "Defines one deliverable of a draft milestone contract. The index is",
        "derived on-chain, not supplied by the caller."
      ],
      "discriminator": [
        165,
        18,
        177,
        128,
        204,
        172,
        23,
        249
      ],
      "accounts": [
        {
          "name": "employer",
          "docs": [
            "Pays rent for the new `WorkUnit`, so must be mutable, and must sign.",
            "`has_one` on the contract below is what ties this signer to *this*",
            "contract's employer."
          ],
          "writable": true,
          "signer": true,
          "relations": [
            "contract"
          ]
        },
        {
          "name": "contract",
          "docs": [
            "`Account<Contract>` already proves this is a genuine contract owned by",
            "this program with the right discriminator. Re-deriving the PDA from the",
            "stored identity fields then proves the account sits at its canonical",
            "address, so a cloned copy at some other key cannot be substituted.",
            "`has_one` proves the signer is this contract's employer."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  97,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "employer"
              },
              {
                "kind": "account",
                "path": "contract.freelancer",
                "account": "contract"
              },
              {
                "kind": "account",
                "path": "contract.contractId",
                "account": "contract"
              }
            ]
          }
        },
        {
          "name": "workUnit",
          "docs": [
            "The new milestone. Its address is derived from the parent contract and",
            "the parent's current unit count, so the caller has no say in either."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  111,
                  114,
                  107,
                  95,
                  117,
                  110,
                  105,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "contract"
              },
              {
                "kind": "account",
                "path": "contract.workUnitCount",
                "account": "contract"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "dueOffsetSeconds",
          "type": "i64"
        }
      ]
    },
    {
      "name": "approveActivation",
      "docs": [
        "Employer approves activation and establishes main-contract timing."
      ],
      "discriminator": [
        14,
        237,
        238,
        77,
        77,
        217,
        130,
        64
      ],
      "accounts": [
        {
          "name": "employer",
          "signer": true,
          "relations": [
            "contract"
          ]
        },
        {
          "name": "contract",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  97,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "employer"
              },
              {
                "kind": "account",
                "path": "contract.freelancer",
                "account": "contract"
              },
              {
                "kind": "account",
                "path": "contract.contractId",
                "account": "contract"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "approveTrialAndActivate",
      "docs": [
        "Employer approves submitted trial work and starts the main contract."
      ],
      "discriminator": [
        128,
        25,
        48,
        10,
        120,
        204,
        30,
        93
      ],
      "accounts": [
        {
          "name": "employer",
          "signer": true,
          "relations": [
            "contract"
          ]
        },
        {
          "name": "contract",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  97,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "employer"
              },
              {
                "kind": "account",
                "path": "contract.freelancer",
                "account": "contract"
              },
              {
                "kind": "account",
                "path": "contract.contractId",
                "account": "contract"
              }
            ]
          },
          "relations": [
            "trialWorkUnit"
          ]
        },
        {
          "name": "trialWorkUnit",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  105,
                  97,
                  108,
                  95,
                  117,
                  110,
                  105,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "contract"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "approveWorkUnit",
      "docs": [
        "Employer releases a submitted post-activation work unit. No SPL transfer."
      ],
      "discriminator": [
        224,
        74,
        210,
        151,
        158,
        3,
        226,
        100
      ],
      "accounts": [
        {
          "name": "employer",
          "signer": true,
          "relations": [
            "contract"
          ]
        },
        {
          "name": "contract",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  97,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "employer"
              },
              {
                "kind": "account",
                "path": "contract.freelancer",
                "account": "contract"
              },
              {
                "kind": "account",
                "path": "contract.contractId",
                "account": "contract"
              }
            ]
          },
          "relations": [
            "workUnit"
          ]
        },
        {
          "name": "workUnit",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  111,
                  114,
                  107,
                  95,
                  117,
                  110,
                  105,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "contract"
              },
              {
                "kind": "account",
                "path": "workUnit.index",
                "account": "workUnit"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "cancelActiveContract",
      "docs": [
        "Employer cancels an Active contract and freezes the economic split.",
        "No SPL transfer."
      ],
      "discriminator": [
        71,
        211,
        249,
        238,
        30,
        210,
        230,
        173
      ],
      "accounts": [
        {
          "name": "employer",
          "signer": true,
          "relations": [
            "contract"
          ]
        },
        {
          "name": "contract",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  97,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "employer"
              },
              {
                "kind": "account",
                "path": "contract.freelancer",
                "account": "contract"
              },
              {
                "kind": "account",
                "path": "contract.contractId",
                "account": "contract"
              }
            ]
          }
        },
        {
          "name": "hourlyState",
          "writable": true,
          "optional": true,
          "docs": [
            "Required for Hourly so an Open session cannot be cancelled away.",
            "Must be absent for Fixed / Milestone / Streaming."
          ]
        }
      ],
      "args": []
    },
    {
      "name": "cancelStream",
      "discriminator": [
        218,
        221,
        38,
        25,
        177,
        207,
        188,
        91
      ],
      "accounts": [
        {
          "name": "stream",
          "writable": true
        },
        {
          "name": "employer",
          "signer": true,
          "relations": [
            "stream"
          ]
        },
        {
          "name": "worker",
          "docs": [
            "This must match the worker stored in the stream."
          ],
          "relations": [
            "stream"
          ]
        },
        {
          "name": "tokenMint",
          "relations": [
            "stream"
          ]
        },
        {
          "name": "employerTokenAccount",
          "writable": true
        },
        {
          "name": "workerTokenAccount",
          "writable": true
        },
        {
          "name": "escrowTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "stream"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "claimEmployerRefund",
      "docs": [
        "Employer claims remaining Phase 7 frozen refundable entitlement."
      ],
      "discriminator": [
        219,
        106,
        169,
        225,
        78,
        191,
        52,
        213
      ],
      "accounts": [
        {
          "name": "employer",
          "signer": true,
          "relations": [
            "contract"
          ]
        },
        {
          "name": "contract",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  97,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "employer"
              },
              {
                "kind": "account",
                "path": "contract.freelancer",
                "account": "contract"
              },
              {
                "kind": "account",
                "path": "contract.contractId",
                "account": "contract"
              }
            ]
          }
        },
        {
          "name": "tokenMint",
          "relations": [
            "contract"
          ]
        },
        {
          "name": "contractEscrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  97,
                  99,
                  116,
                  95,
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "contract"
              }
            ]
          }
        },
        {
          "name": "employerTokenAccount",
          "docs": [
            "Any classic SPL token account of the contract mint owned by the",
            "employer. Not ATA-only."
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "completeContract",
      "docs": [
        "Permissionless successful completion. No SPL transfer."
      ],
      "discriminator": [
        129,
        158,
        69,
        250,
        180,
        196,
        197,
        185
      ],
      "accounts": [
        {
          "name": "caller",
          "docs": [
            "Permissionless payer. The result is determined by Clock and state."
          ],
          "signer": true
        },
        {
          "name": "contract",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  97,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "contract.employer",
                "account": "contract"
              },
              {
                "kind": "account",
                "path": "contract.freelancer",
                "account": "contract"
              },
              {
                "kind": "account",
                "path": "contract.contractId",
                "account": "contract"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "createContract",
      "docs": [
        "Creates a funded contract and offers it to the freelancer."
      ],
      "discriminator": [
        244,
        48,
        244,
        178,
        216,
        88,
        122,
        52
      ],
      "accounts": [
        {
          "name": "employer",
          "docs": [
            "Pays for both new accounts and funds the escrow, so must be mutable and",
            "must sign."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "freelancer",
          "docs": [
            "No data is read from it, so there is nothing to validate. It is",
            "deliberately not a `SystemAccount`: that would require the freelancer's",
            "wallet to already exist on-chain, excluding anyone who has never held",
            "SOL. The freelancer does not sign here; consent happens in",
            "`accept_contract`."
          ]
        },
        {
          "name": "tokenMint"
        },
        {
          "name": "employerTokenAccount",
          "docs": [
            "Source of the escrow funding. Constrained rather than trusted: without",
            "`token::authority` an attacker could name a token account they do not",
            "own, and without `token::mint` they could fund the escrow with a",
            "worthless token while the contract claims a valuable one."
          ],
          "writable": true
        },
        {
          "name": "contract",
          "docs": [
            "The contract itself. `init` plus `seeds` means the address is fully",
            "determined by employer, freelancer and `contract_id`, so a forged",
            "contract account cannot be substituted and a duplicate triple is",
            "rejected by the runtime as an already-initialized account."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  97,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "employer"
              },
              {
                "kind": "account",
                "path": "freelancer"
              },
              {
                "kind": "arg",
                "path": "args.contractId"
              }
            ]
          }
        },
        {
          "name": "contractEscrow",
          "docs": [
            "The contract's own escrow, derived from the contract's address and owned",
            "by the contract PDA. Three constraints together make a fake escrow",
            "impossible: `seeds` fixes the address, `token::mint` fixes the asset, and",
            "`token::authority` means only this program signing as the contract PDA",
            "can ever move the funds out."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  97,
                  99,
                  116,
                  95,
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "contract"
              }
            ]
          }
        },
        {
          "name": "trialWorkUnit",
          "docs": [
            "Present iff `args.trial_amount > 0`. Initialized at the dedicated",
            "`trial_unit` PDA so it cannot collide with milestone indexes."
          ],
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  105,
                  97,
                  108,
                  95,
                  117,
                  110,
                  105,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "contract"
              }
            ]
          }
        },
        {
          "name": "fixedWorkUnit",
          "docs": [
            "Present iff `args.payment_mode == Fixed`. One main deliverable at",
            "`work_unit` index 0, amount = `main_amount`. The freelancer can inspect",
            "it before accepting. Seeds are independent of the trial PDA."
          ],
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  111,
                  114,
                  107,
                  95,
                  117,
                  110,
                  105,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "contract"
              },
              {
                "kind": "const",
                "value": [
                  0,
                  0,
                  0,
                  0
                ]
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "createContractArgs"
            }
          }
        }
      ]
    },
    {
      "name": "createHourlyContract",
      "docs": [
        "Dedicated Hourly create. Derives and funds totalAmount. No session."
      ],
      "discriminator": [
        125,
        81,
        39,
        52,
        149,
        5,
        211,
        125
      ],
      "accounts": [
        {
          "name": "employer",
          "writable": true,
          "signer": true
        },
        {
          "name": "freelancer"
        },
        {
          "name": "tokenMint"
        },
        {
          "name": "employerTokenAccount",
          "writable": true
        },
        {
          "name": "contract",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  97,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "employer"
              },
              {
                "kind": "account",
                "path": "freelancer"
              },
              {
                "kind": "arg",
                "path": "args.contractId"
              }
            ]
          }
        },
        {
          "name": "contractEscrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  97,
                  99,
                  116,
                  95,
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "contract"
              }
            ]
          }
        },
        {
          "name": "hourlyState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  117,
                  114,
                  108,
                  121,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "contract"
              }
            ]
          }
        },
        {
          "name": "trialWorkUnit",
          "writable": true,
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  105,
                  97,
                  108,
                  95,
                  117,
                  110,
                  105,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "contract"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "createHourlyContractArgs"
            }
          }
        }
      ]
    },
    {
      "name": "createStream",
      "discriminator": [
        71,
        188,
        111,
        127,
        108,
        40,
        229,
        158
      ],
      "accounts": [
        {
          "name": "stream",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  114,
                  101,
                  97,
                  109
                ]
              },
              {
                "kind": "account",
                "path": "employer"
              },
              {
                "kind": "account",
                "path": "worker"
              },
              {
                "kind": "arg",
                "path": "streamId"
              }
            ]
          }
        },
        {
          "name": "employer",
          "writable": true,
          "signer": true
        },
        {
          "name": "worker",
          "docs": [
            "The worker does not need to sign when a stream is created."
          ]
        },
        {
          "name": "tokenMint"
        },
        {
          "name": "employerTokenAccount",
          "writable": true
        },
        {
          "name": "escrowTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "stream"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "streamId",
          "type": "u64"
        },
        {
          "name": "totalAmount",
          "type": "u64"
        },
        {
          "name": "durationSeconds",
          "type": "i64"
        }
      ]
    },
    {
      "name": "declineContract",
      "docs": [
        "Freelancer refuses a funded offer. Escrow is left in place."
      ],
      "discriminator": [
        229,
        120,
        200,
        154,
        125,
        221,
        227,
        105
      ],
      "accounts": [
        {
          "name": "freelancer",
          "signer": true,
          "relations": [
            "contract"
          ]
        },
        {
          "name": "contract",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  97,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "contract.employer",
                "account": "contract"
              },
              {
                "kind": "account",
                "path": "freelancer"
              },
              {
                "kind": "account",
                "path": "contract.contractId",
                "account": "contract"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "endHourlyContract",
      "docs": [
        "Employer unused-budget Hourly settlement. Rejects an Open session.",
        "Uses Cancelled so existing claim instructions apply. No SPL transfer."
      ],
      "discriminator": [
        26,
        65,
        53,
        53,
        54,
        10,
        222,
        39
      ],
      "accounts": [
        {
          "name": "employer",
          "signer": true,
          "relations": [
            "contract"
          ]
        },
        {
          "name": "contract",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  97,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "employer"
              },
              {
                "kind": "account",
                "path": "contract.freelancer",
                "account": "contract"
              },
              {
                "kind": "account",
                "path": "contract.contractId",
                "account": "contract"
              }
            ]
          }
        },
        {
          "name": "hourlyState",
          "relations": [
            "contract"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  117,
                  114,
                  108,
                  121,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "contract"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "finalizeReviewTimeout",
      "docs": [
        "Permissionless auto-release of an expired post-activation review."
      ],
      "discriminator": [
        131,
        182,
        242,
        19,
        186,
        139,
        211,
        107
      ],
      "accounts": [
        {
          "name": "caller",
          "docs": [
            "Permissionless: the result is determined by clock and unit state, not",
            "by who pays the fee."
          ],
          "signer": true
        },
        {
          "name": "contract",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  97,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "contract.employer",
                "account": "contract"
              },
              {
                "kind": "account",
                "path": "contract.freelancer",
                "account": "contract"
              },
              {
                "kind": "account",
                "path": "contract.contractId",
                "account": "contract"
              }
            ]
          },
          "relations": [
            "workUnit"
          ]
        },
        {
          "name": "workUnit",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  111,
                  114,
                  107,
                  95,
                  117,
                  110,
                  105,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "contract"
              },
              {
                "kind": "account",
                "path": "workUnit.index",
                "account": "workUnit"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "finalizeTerms",
      "docs": [
        "Locks a fully allocated milestone contract's terms and offers it."
      ],
      "discriminator": [
        206,
        71,
        159,
        230,
        147,
        59,
        110,
        55
      ],
      "accounts": [
        {
          "name": "employer",
          "signer": true,
          "relations": [
            "contract"
          ]
        },
        {
          "name": "contract",
          "docs": [
            "Same two checks as `add_milestone`: the account is a real contract at",
            "its canonical PDA, and the signer is its employer."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  97,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "employer"
              },
              {
                "kind": "account",
                "path": "contract.freelancer",
                "account": "contract"
              },
              {
                "kind": "account",
                "path": "contract.contractId",
                "account": "contract"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "openDispute",
      "docs": [
        "Employer or freelancer freezes contested economics. No SPL transfer."
      ],
      "discriminator": [
        137,
        25,
        99,
        119,
        23,
        223,
        161,
        42
      ],
      "accounts": [
        {
          "name": "party",
          "docs": [
            "Employer or freelancer. Identity is checked against stored keys."
          ],
          "signer": true
        },
        {
          "name": "contract",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  97,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "contract.employer",
                "account": "contract"
              },
              {
                "kind": "account",
                "path": "contract.freelancer",
                "account": "contract"
              },
              {
                "kind": "account",
                "path": "contract.contractId",
                "account": "contract"
              }
            ]
          }
        },
        {
          "name": "hourlyState",
          "writable": true,
          "optional": true,
          "docs": [
            "Required when paymentMode is Hourly. Absent otherwise."
          ]
        },
        {
          "name": "hourlySession",
          "writable": true,
          "optional": true,
          "docs": [
            "Required when Hourly and an Open session exists. Absent otherwise."
          ]
        }
      ],
      "args": []
    },
    {
      "name": "rejectActivation",
      "docs": [
        "Employer declines to activate after the trial stage. Escrow is left in place."
      ],
      "discriminator": [
        116,
        36,
        99,
        219,
        181,
        114,
        135,
        129
      ],
      "accounts": [
        {
          "name": "employer",
          "signer": true,
          "relations": [
            "contract"
          ]
        },
        {
          "name": "contract",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  97,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "employer"
              },
              {
                "kind": "account",
                "path": "contract.freelancer",
                "account": "contract"
              },
              {
                "kind": "account",
                "path": "contract.contractId",
                "account": "contract"
              }
            ]
          },
          "relations": [
            "trialWorkUnit"
          ]
        },
        {
          "name": "trialWorkUnit",
          "docs": [
            "Required when a trial is configured; omitted otherwise."
          ],
          "optional": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  105,
                  97,
                  108,
                  95,
                  117,
                  110,
                  105,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "contract"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "releaseStreamAccrual",
      "docs": [
        "Materialize currently accrued streaming earnings into released accounting.",
        "Permissionless and deterministic. No SPL transfer."
      ],
      "discriminator": [
        231,
        113,
        14,
        244,
        13,
        195,
        126,
        50
      ],
      "accounts": [
        {
          "name": "caller",
          "docs": [
            "Permissionless: the result does not depend on who pays the fee."
          ],
          "signer": true
        },
        {
          "name": "contract",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  97,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "contract.employer",
                "account": "contract"
              },
              {
                "kind": "account",
                "path": "contract.freelancer",
                "account": "contract"
              },
              {
                "kind": "account",
                "path": "contract.contractId",
                "account": "contract"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "requestRevision",
      "docs": [
        "Employer requests a bounded resubmission of post-activation work."
      ],
      "discriminator": [
        205,
        195,
        75,
        171,
        242,
        149,
        90,
        14
      ],
      "accounts": [
        {
          "name": "employer",
          "signer": true,
          "relations": [
            "contract"
          ]
        },
        {
          "name": "contract",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  97,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "employer"
              },
              {
                "kind": "account",
                "path": "contract.freelancer",
                "account": "contract"
              },
              {
                "kind": "account",
                "path": "contract.contractId",
                "account": "contract"
              }
            ]
          },
          "relations": [
            "workUnit"
          ]
        },
        {
          "name": "workUnit",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  111,
                  114,
                  107,
                  95,
                  117,
                  110,
                  105,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "contract"
              },
              {
                "kind": "account",
                "path": "workUnit.index",
                "account": "workUnit"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "requestTrialRevision",
      "docs": [
        "Employer requests a bounded trial revision."
      ],
      "discriminator": [
        136,
        118,
        160,
        100,
        99,
        145,
        3,
        157
      ],
      "accounts": [
        {
          "name": "employer",
          "signer": true,
          "relations": [
            "contract"
          ]
        },
        {
          "name": "contract",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  97,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "employer"
              },
              {
                "kind": "account",
                "path": "contract.freelancer",
                "account": "contract"
              },
              {
                "kind": "account",
                "path": "contract.contractId",
                "account": "contract"
              }
            ]
          },
          "relations": [
            "trialWorkUnit"
          ]
        },
        {
          "name": "trialWorkUnit",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  105,
                  97,
                  108,
                  95,
                  117,
                  110,
                  105,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "contract"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "resolveDispute",
      "docs": [
        "Per-contract resolver allocates the contested remainder. No SPL transfer."
      ],
      "discriminator": [
        231,
        6,
        202,
        6,
        96,
        103,
        12,
        230
      ],
      "accounts": [
        {
          "name": "resolver",
          "signer": true,
          "relations": [
            "contract"
          ]
        },
        {
          "name": "contract",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  97,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "contract.employer",
                "account": "contract"
              },
              {
                "kind": "account",
                "path": "contract.freelancer",
                "account": "contract"
              },
              {
                "kind": "account",
                "path": "contract.contractId",
                "account": "contract"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "freelancerContestedAward",
          "type": "u64"
        }
      ]
    },
    {
      "name": "startHourlySession",
      "docs": [
        "Freelancer starts one Hourly session. No SPL transfer."
      ],
      "discriminator": [
        105,
        110,
        200,
        198,
        143,
        186,
        166,
        249
      ],
      "accounts": [
        {
          "name": "freelancer",
          "writable": true,
          "signer": true,
          "relations": [
            "contract"
          ]
        },
        {
          "name": "contract",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  97,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "contract.employer",
                "account": "contract"
              },
              {
                "kind": "account",
                "path": "freelancer"
              },
              {
                "kind": "account",
                "path": "contract.contractId",
                "account": "contract"
              }
            ]
          }
        },
        {
          "name": "hourlyState",
          "writable": true,
          "relations": [
            "contract"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  117,
                  114,
                  108,
                  121,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "contract"
              }
            ]
          }
        },
        {
          "name": "hourlySession",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  117,
                  114,
                  108,
                  121,
                  95,
                  115,
                  101,
                  115,
                  115,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "contract"
              },
              {
                "kind": "account",
                "path": "hourlyState.sessionCount",
                "account": "hourlyState"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "stopHourlySession",
      "docs": [
        "Freelancer stops the open Hourly session. No SPL transfer."
      ],
      "discriminator": [
        17,
        63,
        118,
        139,
        152,
        248,
        159,
        129
      ],
      "accounts": [
        {
          "name": "freelancer",
          "signer": true,
          "relations": [
            "contract"
          ]
        },
        {
          "name": "contract",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  97,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "contract.employer",
                "account": "contract"
              },
              {
                "kind": "account",
                "path": "freelancer"
              },
              {
                "kind": "account",
                "path": "contract.contractId",
                "account": "contract"
              }
            ]
          }
        },
        {
          "name": "hourlyState",
          "writable": true,
          "relations": [
            "contract"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  117,
                  114,
                  108,
                  121,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "contract"
              }
            ]
          }
        },
        {
          "name": "hourlySession",
          "writable": true,
          "relations": [
            "contract"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  117,
                  114,
                  108,
                  121,
                  95,
                  115,
                  101,
                  115,
                  115,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "contract"
              },
              {
                "kind": "account",
                "path": "hourlyState.activeSessionIndex",
                "account": "hourlyState"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "workLogUri",
          "type": "string"
        },
        {
          "name": "workLogHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "submitTrialWork",
      "docs": [
        "Freelancer submits paid trial work. Does not release funds or activate."
      ],
      "discriminator": [
        44,
        19,
        181,
        116,
        147,
        209,
        19,
        192
      ],
      "accounts": [
        {
          "name": "freelancer",
          "signer": true,
          "relations": [
            "contract"
          ]
        },
        {
          "name": "contract",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  97,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "contract.employer",
                "account": "contract"
              },
              {
                "kind": "account",
                "path": "freelancer"
              },
              {
                "kind": "account",
                "path": "contract.contractId",
                "account": "contract"
              }
            ]
          },
          "relations": [
            "trialWorkUnit"
          ]
        },
        {
          "name": "trialWorkUnit",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  105,
                  97,
                  108,
                  95,
                  117,
                  110,
                  105,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "contract"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "submissionUri",
          "type": "string"
        },
        {
          "name": "submissionHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "submitWorkUnit",
      "docs": [
        "Freelancer submits post-activation Milestone or Fixed work."
      ],
      "discriminator": [
        244,
        35,
        47,
        83,
        30,
        238,
        10,
        9
      ],
      "accounts": [
        {
          "name": "freelancer",
          "signer": true,
          "relations": [
            "contract"
          ]
        },
        {
          "name": "contract",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  97,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "contract.employer",
                "account": "contract"
              },
              {
                "kind": "account",
                "path": "freelancer"
              },
              {
                "kind": "account",
                "path": "contract.contractId",
                "account": "contract"
              }
            ]
          },
          "relations": [
            "workUnit"
          ]
        },
        {
          "name": "workUnit",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  111,
                  114,
                  107,
                  95,
                  117,
                  110,
                  105,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "contract"
              },
              {
                "kind": "account",
                "path": "workUnit.index",
                "account": "workUnit"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "submissionUri",
          "type": "string"
        },
        {
          "name": "submissionHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "voidStaleRevision",
      "docs": [
        "Employer voids a stale Revising main deliverable. No SPL transfer."
      ],
      "discriminator": [
        218,
        41,
        214,
        129,
        255,
        79,
        60,
        139
      ],
      "accounts": [
        {
          "name": "employer",
          "signer": true,
          "relations": [
            "contract"
          ]
        },
        {
          "name": "contract",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  97,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "employer"
              },
              {
                "kind": "account",
                "path": "contract.freelancer",
                "account": "contract"
              },
              {
                "kind": "account",
                "path": "contract.contractId",
                "account": "contract"
              }
            ]
          },
          "relations": [
            "workUnit"
          ]
        },
        {
          "name": "workUnit",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  111,
                  114,
                  107,
                  95,
                  117,
                  110,
                  105,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "contract"
              },
              {
                "kind": "account",
                "path": "workUnit.index",
                "account": "workUnit"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "withdraw",
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "stream",
          "writable": true
        },
        {
          "name": "worker",
          "signer": true,
          "relations": [
            "stream"
          ]
        },
        {
          "name": "tokenMint",
          "relations": [
            "stream"
          ]
        },
        {
          "name": "workerTokenAccount",
          "writable": true
        },
        {
          "name": "escrowTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "stream"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "withdrawFreelancer",
      "docs": [
        "Freelancer withdraws all currently available released/settled entitlement."
      ],
      "discriminator": [
        174,
        220,
        176,
        121,
        65,
        46,
        187,
        22
      ],
      "accounts": [
        {
          "name": "freelancer",
          "signer": true,
          "relations": [
            "contract"
          ]
        },
        {
          "name": "contract",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  97,
                  99,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "contract.employer",
                "account": "contract"
              },
              {
                "kind": "account",
                "path": "freelancer"
              },
              {
                "kind": "account",
                "path": "contract.contractId",
                "account": "contract"
              }
            ]
          }
        },
        {
          "name": "tokenMint",
          "relations": [
            "contract"
          ]
        },
        {
          "name": "contractEscrow",
          "docs": [
            "Canonical escrow for this Contract. Seeds bind it to `contract`; mint",
            "and authority bind it to the funded asset and the Contract PDA."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  116,
                  114,
                  97,
                  99,
                  116,
                  95,
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "contract"
              }
            ]
          }
        },
        {
          "name": "freelancerTokenAccount",
          "docs": [
            "Any classic SPL token account of the contract mint owned by the",
            "freelancer. Not ATA-only."
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "contract",
      "discriminator": [
        172,
        138,
        115,
        242,
        121,
        67,
        183,
        26
      ]
    },
    {
      "name": "hourlySession",
      "discriminator": [
        19,
        255,
        160,
        105,
        76,
        55,
        185,
        240
      ]
    },
    {
      "name": "hourlyState",
      "discriminator": [
        101,
        103,
        254,
        84,
        72,
        77,
        199,
        115
      ]
    },
    {
      "name": "stream",
      "discriminator": [
        166,
        224,
        59,
        4,
        202,
        10,
        186,
        83
      ]
    },
    {
      "name": "workUnit",
      "discriminator": [
        172,
        240,
        239,
        121,
        15,
        111,
        159,
        169
      ]
    }
  ],
  "events": [
    {
      "name": "activationRejected",
      "discriminator": [
        170,
        33,
        164,
        118,
        168,
        17,
        62,
        160
      ]
    },
    {
      "name": "contractAccepted",
      "discriminator": [
        44,
        209,
        126,
        23,
        190,
        99,
        31,
        196
      ]
    },
    {
      "name": "contractActivated",
      "discriminator": [
        4,
        154,
        226,
        21,
        37,
        131,
        12,
        219
      ]
    },
    {
      "name": "contractCancellationSettled",
      "discriminator": [
        64,
        179,
        183,
        177,
        79,
        20,
        124,
        43
      ]
    },
    {
      "name": "contractCompleted",
      "discriminator": [
        99,
        32,
        99,
        27,
        103,
        45,
        188,
        151
      ]
    },
    {
      "name": "contractCreated",
      "discriminator": [
        80,
        69,
        164,
        109,
        77,
        15,
        47,
        164
      ]
    },
    {
      "name": "contractDeclined",
      "discriminator": [
        9,
        118,
        156,
        41,
        196,
        21,
        1,
        226
      ]
    },
    {
      "name": "disputeOpened",
      "discriminator": [
        239,
        222,
        102,
        235,
        193,
        85,
        1,
        214
      ]
    },
    {
      "name": "disputeResolved",
      "discriminator": [
        121,
        64,
        249,
        153,
        139,
        128,
        236,
        187
      ]
    },
    {
      "name": "employerRefundClaimed",
      "discriminator": [
        251,
        43,
        237,
        49,
        23,
        113,
        22,
        39
      ]
    },
    {
      "name": "freelancerWithdrawal",
      "discriminator": [
        97,
        134,
        235,
        236,
        166,
        205,
        238,
        128
      ]
    },
    {
      "name": "hourlyContractCreated",
      "discriminator": [
        232,
        8,
        91,
        174,
        121,
        142,
        221,
        140
      ]
    },
    {
      "name": "hourlyContractEnded",
      "discriminator": [
        93,
        84,
        91,
        223,
        113,
        24,
        178,
        110
      ]
    },
    {
      "name": "hourlySessionRecorded",
      "discriminator": [
        12,
        197,
        4,
        56,
        143,
        205,
        184,
        131
      ]
    },
    {
      "name": "hourlySessionStarted",
      "discriminator": [
        6,
        63,
        75,
        36,
        15,
        180,
        214,
        115
      ]
    },
    {
      "name": "milestoneAdded",
      "discriminator": [
        25,
        65,
        182,
        178,
        253,
        180,
        118,
        77
      ]
    },
    {
      "name": "streamAccrualReleased",
      "discriminator": [
        39,
        213,
        135,
        163,
        146,
        157,
        240,
        50
      ]
    },
    {
      "name": "termsFinalized",
      "discriminator": [
        10,
        116,
        161,
        152,
        181,
        100,
        209,
        44
      ]
    },
    {
      "name": "trialApproved",
      "discriminator": [
        2,
        110,
        94,
        43,
        143,
        111,
        86,
        155
      ]
    },
    {
      "name": "trialConfigured",
      "discriminator": [
        53,
        13,
        124,
        182,
        69,
        42,
        253,
        43
      ]
    },
    {
      "name": "trialRejected",
      "discriminator": [
        91,
        90,
        223,
        84,
        43,
        232,
        217,
        50
      ]
    },
    {
      "name": "trialRevisionRequested",
      "discriminator": [
        156,
        184,
        33,
        45,
        115,
        90,
        83,
        15
      ]
    },
    {
      "name": "trialSubmitted",
      "discriminator": [
        57,
        24,
        217,
        63,
        28,
        150,
        24,
        76
      ]
    },
    {
      "name": "workUnitApproved",
      "discriminator": [
        192,
        198,
        6,
        177,
        1,
        202,
        157,
        191
      ]
    },
    {
      "name": "workUnitReviewTimedOut",
      "discriminator": [
        231,
        232,
        242,
        197,
        164,
        101,
        41,
        5
      ]
    },
    {
      "name": "workUnitRevisionRequested",
      "discriminator": [
        33,
        63,
        179,
        196,
        105,
        181,
        185,
        45
      ]
    },
    {
      "name": "workUnitStaleRevisionVoided",
      "discriminator": [
        127,
        55,
        118,
        220,
        159,
        214,
        133,
        1
      ]
    },
    {
      "name": "workUnitSubmitted",
      "discriminator": [
        212,
        210,
        177,
        58,
        32,
        129,
        94,
        213
      ]
    }
  ],
  "errors": [
    {
      "code": 6115,
      "name": "acceptanceExpired",
      "msg": "The acceptance deadline has passed."
    },
    {
      "code": 6116,
      "name": "acceptanceNotExpired",
      "msg": "The acceptance deadline has not yet passed."
    },
    {
      "code": 6149,
      "name": "approvalWindowExpired",
      "msg": "The employer activation window has closed."
    },
    {
      "code": 6144,
      "name": "arithmeticOverflow",
      "msg": "A math calculation overflowed."
    },
    {
      "code": 6125,
      "name": "badUnitIndex",
      "msg": "Work unit index does not match the expected next index."
    },
    {
      "code": 6162,
      "name": "completionNotAllowed",
      "msg": "Successful completion is not allowed in this contract state."
    },
    {
      "code": 6165,
      "name": "contractAlreadyCompleted",
      "msg": "This contract is already completed."
    },
    {
      "code": 6160,
      "name": "contractAlreadyDisputed",
      "msg": "This contract is already disputed."
    },
    {
      "code": 6164,
      "name": "contractNotReadyForCompletion",
      "msg": "The contract has not reached an objectively completable point."
    },
    {
      "code": 6112,
      "name": "contractNotStarted",
      "msg": "The contract has not started; terms are not yet accepted."
    },
    {
      "code": 6113,
      "name": "contractTerminal",
      "msg": "The contract is in a terminal state."
    },
    {
      "code": 6159,
      "name": "disputeNotAllowed",
      "msg": "A dispute cannot be opened in this contract state."
    },
    {
      "code": 6137,
      "name": "emptyCheckpoint",
      "msg": "This checkpoint period has no earned amount."
    },
    {
      "code": 6145,
      "name": "escrowFundingMismatch",
      "msg": "Escrow did not receive the full contract amount."
    },
    {
      "code": 6143,
      "name": "escrowNotSettled",
      "msg": "Escrow still holds funds owed to a party."
    },
    {
      "code": 6122,
      "name": "fixedNeedsOneUnit",
      "msg": "A fixed contract requires exactly one work unit."
    },
    {
      "code": 6138,
      "name": "graceWindowClosed",
      "msg": "The post-termination grace window has closed."
    },
    {
      "code": 6174,
      "name": "hourlyAuthorizedTimeExhausted",
      "msg": "Authorized Hourly time is exhausted."
    },
    {
      "code": 6175,
      "name": "hourlyEngagementExpired",
      "msg": "The Hourly engagement window has closed."
    },
    {
      "code": 6168,
      "name": "hourlyMainAmountZero",
      "msg": "Derived Hourly main amount is zero; rate and authorized time are too small."
    },
    {
      "code": 6178,
      "name": "hourlyOpenSessionBlocksClose",
      "msg": "An open Hourly session blocks cancel or end."
    },
    {
      "code": 6171,
      "name": "hourlySessionAlreadyActive",
      "msg": "An Hourly session is already open."
    },
    {
      "code": 6177,
      "name": "hourlySessionAlreadyRecorded",
      "msg": "This Hourly session is already closed."
    },
    {
      "code": 6173,
      "name": "hourlySessionLimitReached",
      "msg": "This contract has reached the Hourly session limit."
    },
    {
      "code": 6169,
      "name": "hourlyStateMissing",
      "msg": "HourlyState account is required for this Hourly operation."
    },
    {
      "code": 6157,
      "name": "insufficientEscrowBalance",
      "msg": "Escrow holds fewer tokens than the entitlement being claimed."
    },
    {
      "code": 6106,
      "name": "invalidAcceptanceDeadline",
      "msg": "Acceptance deadline must be in the future."
    },
    {
      "code": 6148,
      "name": "invalidActivationReview",
      "msg": "Activation review duration is outside the permitted range."
    },
    {
      "code": 6100,
      "name": "invalidAmount",
      "msg": "Amount must be greater than zero."
    },
    {
      "code": 6167,
      "name": "invalidAuthorizedSeconds",
      "msg": "Authorized Hourly seconds must be greater than zero."
    },
    {
      "code": 6102,
      "name": "invalidCheckpointInterval",
      "msg": "Checkpoint interval is invalid for this duration."
    },
    {
      "code": 6161,
      "name": "invalidDisputeAward",
      "msg": "The dispute award exceeds the contested amount."
    },
    {
      "code": 6147,
      "name": "invalidDueDate",
      "msg": "Milestone due offset is not a positive duration within the contract term, or is not later than the previous milestone."
    },
    {
      "code": 6101,
      "name": "invalidDuration",
      "msg": "Duration is outside the permitted range."
    },
    {
      "code": 6166,
      "name": "invalidHourlyRate",
      "msg": "Hourly rate must be greater than zero."
    },
    {
      "code": 6176,
      "name": "invalidHourlySession",
      "msg": "HourlySession does not belong to this contract or is not valid."
    },
    {
      "code": 6170,
      "name": "invalidHourlyState",
      "msg": "HourlyState does not belong to this contract or is not valid."
    },
    {
      "code": 6105,
      "name": "invalidMaxRevisions",
      "msg": "Maximum revisions exceeds the permitted limit."
    },
    {
      "code": 6108,
      "name": "invalidMetadata",
      "msg": "Metadata reference is missing or exceeds the maximum length."
    },
    {
      "code": 6110,
      "name": "invalidPaymentMode",
      "msg": "This operation is not valid for the contract's payment mode."
    },
    {
      "code": 6158,
      "name": "invalidResolver",
      "msg": "Resolver must be a distinct non-default public key."
    },
    {
      "code": 6103,
      "name": "invalidReviewDuration",
      "msg": "Review duration is outside the permitted range or exceeds the checkpoint interval."
    },
    {
      "code": 6107,
      "name": "invalidScheduledStart",
      "msg": "Scheduled start must not precede the acceptance deadline."
    },
    {
      "code": 6111,
      "name": "invalidState",
      "msg": "The contract is not in the required state for this operation."
    },
    {
      "code": 6151,
      "name": "invalidTrialAmount",
      "msg": "Trial amount is zero, equals or exceeds the funded total, or does not match the trial account."
    },
    {
      "code": 6154,
      "name": "invalidTrialState",
      "msg": "The trial work unit is not in the required state for this operation."
    },
    {
      "code": 6124,
      "name": "invalidWorkUnit",
      "msg": "The work unit is invalid or does not belong to this contract."
    },
    {
      "code": 6119,
      "name": "milestoneAllocationExceeded",
      "msg": "Milestone amounts exceed the funded total."
    },
    {
      "code": 6120,
      "name": "milestoneAllocationIncomplete",
      "msg": "Milestone amounts do not sum to the funded total."
    },
    {
      "code": 6172,
      "name": "noActiveHourlySession",
      "msg": "There is no open Hourly session."
    },
    {
      "code": 6121,
      "name": "noMilestones",
      "msg": "This payment mode requires at least one milestone."
    },
    {
      "code": 6141,
      "name": "nothingReleasable",
      "msg": "Nothing has been released on this contract."
    },
    {
      "code": 6140,
      "name": "nothingToRefund",
      "msg": "There is nothing available to refund."
    },
    {
      "code": 6139,
      "name": "nothingToWithdraw",
      "msg": "There is nothing available to withdraw."
    },
    {
      "code": 6117,
      "name": "obligationsOutstanding",
      "msg": "Outstanding obligations remain on this contract."
    },
    {
      "code": 6142,
      "name": "openReviewBlocksCancel",
      "msg": "Cannot cancel while a work unit is under review."
    },
    {
      "code": 6135,
      "name": "periodNotComplete",
      "msg": "The checkpoint period is not yet complete."
    },
    {
      "code": 6156,
      "name": "releaseAmountExceeded",
      "msg": "This release would exceed the contract's main or total amount."
    },
    {
      "code": 6131,
      "name": "reviewAlreadyOpen",
      "msg": "Another work unit is still awaiting review."
    },
    {
      "code": 6133,
      "name": "reviewWindowClosed",
      "msg": "The review window has already closed."
    },
    {
      "code": 6132,
      "name": "reviewWindowOpen",
      "msg": "The review window is still open."
    },
    {
      "code": 6134,
      "name": "revisionLimitReached",
      "msg": "The maximum number of revisions has been reached."
    },
    {
      "code": 6150,
      "name": "scheduledStartElapsed",
      "msg": "The scheduled start has already elapsed; activating now would create retroactive earnings."
    },
    {
      "code": 6109,
      "name": "selfContract",
      "msg": "Employer and freelancer must be different wallets."
    },
    {
      "code": 6136,
      "name": "streamFullyCheckpointed",
      "msg": "All streaming periods have already been checkpointed."
    },
    {
      "code": 6123,
      "name": "streamingHasNoMilestones",
      "msg": "A streaming contract cannot define milestones."
    },
    {
      "code": 6114,
      "name": "termsNotFinalized",
      "msg": "Contract terms have not been finalized."
    },
    {
      "code": 6104,
      "name": "tooManyCheckpoints",
      "msg": "This configuration would create too many checkpoints."
    },
    {
      "code": 6146,
      "name": "tooManyMilestones",
      "msg": "This contract already has the maximum number of milestones."
    },
    {
      "code": 6152,
      "name": "trialNotConfigured",
      "msg": "This contract has no paid trial configured."
    },
    {
      "code": 6153,
      "name": "trialRequired",
      "msg": "A paid trial is configured; this instruction cannot bypass it."
    },
    {
      "code": 6118,
      "name": "unauthorized",
      "msg": "The signer is not authorized for this operation."
    },
    {
      "code": 6128,
      "name": "unitAlreadyReleased",
      "msg": "The work unit has already been released."
    },
    {
      "code": 6130,
      "name": "unitNotStale",
      "msg": "The work unit is not stale and cannot be voided."
    },
    {
      "code": 6126,
      "name": "unitNotSubmittable",
      "msg": "The work unit is not awaiting submission."
    },
    {
      "code": 6127,
      "name": "unitNotUnderReview",
      "msg": "The work unit is not under review."
    },
    {
      "code": 6129,
      "name": "unitVoided",
      "msg": "The work unit has been voided."
    },
    {
      "code": 6163,
      "name": "unresolvedWorkRemaining",
      "msg": "Required work is still unresolved, so the contract cannot complete."
    },
    {
      "code": 6155,
      "name": "unsupportedWorkUnitKind",
      "msg": "This work unit kind cannot use the post-activation review instructions."
    }
  ],
  "types": [
    {
      "name": "activationRejected",
      "docs": [
        "The employer reviewed the trial stage and declined to activate."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "contract",
            "type": "pubkey"
          },
          {
            "name": "employer",
            "type": "pubkey"
          },
          {
            "name": "freelancer",
            "type": "pubkey"
          },
          {
            "name": "rejectedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "contract",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "docs": [
              "On-chain layout version, for forward migration."
            ],
            "type": "u8"
          },
          {
            "name": "employer",
            "docs": [
              "The client funding the work."
            ],
            "type": "pubkey"
          },
          {
            "name": "freelancer",
            "docs": [
              "The worker performing it."
            ],
            "type": "pubkey"
          },
          {
            "name": "tokenMint",
            "docs": [
              "SPL mint of the escrowed token. Classic SPL Token only."
            ],
            "type": "pubkey"
          },
          {
            "name": "contractId",
            "docs": [
              "Employer-scoped identifier; part of the PDA seeds."
            ],
            "type": "u64"
          },
          {
            "name": "paymentMode",
            "type": {
              "defined": {
                "name": "paymentMode"
              }
            }
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "contractStatus"
              }
            }
          },
          {
            "name": "startMode",
            "type": {
              "defined": {
                "name": "startMode"
              }
            }
          },
          {
            "name": "totalAmount",
            "docs": [
              "Amount funded into escrow at creation. Immutable."
            ],
            "type": "u64"
          },
          {
            "name": "trialAmount",
            "docs": [
              "Reserved pre-activation trial compensation, included in `total_amount`.",
              "Zero means no trial is configured. Not a lifecycle predicate: whether a",
              "trial WorkUnit exists is answered by this being positive *and* the",
              "`trial_unit` PDA being initialized."
            ],
            "type": "u64"
          },
          {
            "name": "mainAmount",
            "docs": [
              "Main-contract economic base: `total_amount - trial_amount`. Future",
              "streaming, fixed and milestone settlement uses this, never the trial",
              "reservation. Equals `total_amount` when there is no trial."
            ],
            "type": "u64"
          },
          {
            "name": "allocatedAmount",
            "docs": [
              "Sum of defined milestone work unit amounts. Milestone/Fixed only.",
              "At finalize this must equal `main_amount`, not `total_amount`."
            ],
            "type": "u64"
          },
          {
            "name": "releasedAmount",
            "docs": [
              "Freelancer entitlement unlocked by approval or review timeout."
            ],
            "type": "u64"
          },
          {
            "name": "withdrawnAmount",
            "docs": [
              "Portion of `released_amount` already transferred out."
            ],
            "type": "u64"
          },
          {
            "name": "refundedAmount",
            "docs": [
              "Unreleased funds already returned to the employer."
            ],
            "type": "u64"
          },
          {
            "name": "streamReleasedAmount",
            "docs": [
              "Streaming main-work already materialized into `released_amount`.",
              "Independent of any trial credit, so",
              "`released_amount` conceptually equals `trial_released + stream_released_amount`",
              "on an Active streaming contract. Never inferred from `released_amount`."
            ],
            "type": "u64"
          },
          {
            "name": "freelancerSettlementAmount",
            "docs": [
              "Frozen freelancer entitlement after cancellation, dispute resolution,",
              "or successful completion. Zero until those terminal settlements.",
              "Equals `released_amount` at freeze."
            ],
            "type": "u64"
          },
          {
            "name": "employerRefundableAmount",
            "docs": [
              "Frozen employer refundable entitlement after cancellation, dispute",
              "resolution, or successful completion. Zero until settlement. Not tokens",
              "transferred: that is `refunded_amount`."
            ],
            "type": "u64"
          },
          {
            "name": "resolver",
            "docs": [
              "Per-contract arbitrator. Bound at creation; never the employer,",
              "freelancer, or default. Immutable after `create_contract`."
            ],
            "type": "pubkey"
          },
          {
            "name": "contestedAmount",
            "docs": [
              "Unresolved remainder at dispute open:",
              "`total_amount - released_amount - refunded_amount` after any stream freeze."
            ],
            "type": "u64"
          },
          {
            "name": "disputedAt",
            "docs": [
              "Instant `open_dispute` (or submitted-trial reject) froze economics."
            ],
            "type": "i64"
          },
          {
            "name": "disputeInitiator",
            "type": {
              "defined": {
                "name": "disputeParty"
              }
            }
          },
          {
            "name": "acceptanceDeadline",
            "docs": [
              "Latest instant at which the freelancer may accept."
            ],
            "type": "i64"
          },
          {
            "name": "scheduledStartTime",
            "docs": [
              "Agreed start instant. Only read when `start_mode == Scheduled`."
            ],
            "type": "i64"
          },
          {
            "name": "durationSeconds",
            "docs": [
              "Streaming length. Needed to resolve `end_time` at activation, since",
              "under `OnActivation` the start instant is unknown at creation."
            ],
            "type": "i64"
          },
          {
            "name": "checkpointInterval",
            "docs": [
              "Streaming checkpoint period length. Only read when the payment mode",
              "uses checkpoints."
            ],
            "type": "i64"
          },
          {
            "name": "reviewDuration",
            "docs": [
              "Length of both the employer review window and the freelancer",
              "resubmission window."
            ],
            "type": "i64"
          },
          {
            "name": "activationReviewDuration",
            "docs": [
              "How long the employer has, after freelancer acceptance, to approve or",
              "reject activation. Frozen at creation. The deadline is derived as",
              "`accepted_at + activation_review_duration` once the freelancer accepts."
            ],
            "type": "i64"
          },
          {
            "name": "maxRevisions",
            "docs": [
              "Agreed cap on revision cycles per work unit. Together with",
              "`review_duration` this bounds worst-case withholding."
            ],
            "type": "u8"
          },
          {
            "name": "startTime",
            "docs": [
              "Resolved at employer activation from `start_mode`."
            ],
            "type": "i64"
          },
          {
            "name": "endTime",
            "docs": [
              "Resolved at employer activation as `start_time + duration_seconds`."
            ],
            "type": "i64"
          },
          {
            "name": "lastPeriodEnd",
            "docs": [
              "Streaming checkpoint cursor: the end of the most recently created",
              "period. Guarantees periods are contiguous and non-overlapping."
            ],
            "type": "i64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "acceptedAt",
            "type": "i64"
          },
          {
            "name": "completedAt",
            "type": "i64"
          },
          {
            "name": "terminatedAt",
            "docs": [
              "Instant the contract was cancelled or completed; anchors the",
              "post-termination grace window."
            ],
            "type": "i64"
          },
          {
            "name": "workUnitCount",
            "docs": [
              "Next work unit index to allocate."
            ],
            "type": "u32"
          },
          {
            "name": "releasedUnitCount",
            "type": "u32"
          },
          {
            "name": "voidedUnitCount",
            "type": "u32"
          },
          {
            "name": "openReviewCount",
            "docs": [
              "Units currently in a non-terminal reviewable state. A non-zero value",
              "blocks employer cancellation."
            ],
            "type": "u16"
          },
          {
            "name": "lastMilestoneDueOffset",
            "docs": [
              "Due offset of the most recently defined milestone, in seconds after",
              "start. Zero until the first milestone exists. Used so `add_milestone`",
              "can enforce strictly increasing offsets without iterating children."
            ],
            "type": "i64"
          },
          {
            "name": "metadataHash",
            "docs": [
              "Hash of the canonical off-chain record, making it tamper-evident."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "escrowBump",
            "type": "u8"
          },
          {
            "name": "reserved",
            "docs": [
              "Upgrade headroom. Adding a field means shrinking this, which leaves",
              "account size and every client offset unchanged.",
              "",
              "Started at 128 bytes; `voided_unit_count` (4),",
              "`last_milestone_due_offset` (8), `activation_review_duration` (8),",
              "`trial_amount` (8), `main_amount` (8), `stream_released_amount` (8),",
              "`freelancer_settlement_amount` (8) and `employer_refundable_amount` (8)",
              "were taken from it.",
              "",
              "Phase 7 layout: two u64 settlement fields after `stream_released_amount`;",
              "reserved 84 \u2192 68. Phase 9 consumed 49 more bytes for `resolver` (32),",
              "`contested_amount` (8), `disputed_at` (8) and `dispute_initiator` (1);",
              "reserved 68 \u2192 19. `INIT_SPACE` remains 621."
            ],
            "type": {
              "array": [
                "u8",
                19
              ]
            }
          },
          {
            "name": "metadataUri",
            "docs": [
              "Bounded pointer to the off-chain record."
            ],
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "contractAccepted",
      "docs": [
        "The freelancer accepted a funded offer. The main stream has not started."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "contract",
            "type": "pubkey"
          },
          {
            "name": "employer",
            "type": "pubkey"
          },
          {
            "name": "freelancer",
            "type": "pubkey"
          },
          {
            "name": "acceptedAt",
            "type": "i64"
          },
          {
            "name": "activationDeadline",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "contractActivated",
      "docs": [
        "The employer approved activation. Main-contract timing is now established."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "contract",
            "type": "pubkey"
          },
          {
            "name": "employer",
            "type": "pubkey"
          },
          {
            "name": "freelancer",
            "type": "pubkey"
          },
          {
            "name": "activatedAt",
            "type": "i64"
          },
          {
            "name": "startTime",
            "type": "i64"
          },
          {
            "name": "endTime",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "contractCancellationSettled",
      "docs": [
        "An Active contract was cancelled and its economic split was frozen.",
        "No SPL transfer."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "contract",
            "type": "pubkey"
          },
          {
            "name": "employer",
            "type": "pubkey"
          },
          {
            "name": "freelancer",
            "type": "pubkey"
          },
          {
            "name": "paymentMode",
            "type": {
              "defined": {
                "name": "paymentMode"
              }
            }
          },
          {
            "name": "settledAt",
            "type": "i64"
          },
          {
            "name": "freelancerEntitlement",
            "type": "u64"
          },
          {
            "name": "employerRefundable",
            "type": "u64"
          },
          {
            "name": "releasedAmount",
            "type": "u64"
          },
          {
            "name": "streamReleasedAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "contractCompleted",
      "docs": [
        "Successful completion froze the agreed economic end. No SPL transfer."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "contract",
            "type": "pubkey"
          },
          {
            "name": "employer",
            "type": "pubkey"
          },
          {
            "name": "freelancer",
            "type": "pubkey"
          },
          {
            "name": "completedAt",
            "type": "i64"
          },
          {
            "name": "finalFreelancerEntitlement",
            "type": "u64"
          },
          {
            "name": "finalEmployerEntitlement",
            "type": "u64"
          },
          {
            "name": "releasedAmount",
            "type": "u64"
          },
          {
            "name": "withdrawnAmount",
            "type": "u64"
          },
          {
            "name": "refundedAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "contractCreated",
      "docs": [
        "A contract was created and fully funded into escrow.",
        "",
        "`status` is included because it is the one field an indexer cannot infer:",
        "it distinguishes a contract that is immediately offerable",
        "(`PendingAcceptance`) from a milestone contract still awaiting its",
        "allocation (`Draft`)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "contract",
            "type": "pubkey"
          },
          {
            "name": "employer",
            "type": "pubkey"
          },
          {
            "name": "freelancer",
            "type": "pubkey"
          },
          {
            "name": "tokenMint",
            "type": "pubkey"
          },
          {
            "name": "contractId",
            "type": "u64"
          },
          {
            "name": "paymentMode",
            "type": {
              "defined": {
                "name": "paymentMode"
              }
            }
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "contractStatus"
              }
            }
          },
          {
            "name": "totalAmount",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "contractDeclined",
      "docs": [
        "The freelancer refused a funded offer."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "contract",
            "type": "pubkey"
          },
          {
            "name": "employer",
            "type": "pubkey"
          },
          {
            "name": "freelancer",
            "type": "pubkey"
          },
          {
            "name": "declinedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "contractStatus",
      "docs": [
        "Authoritative contract lifecycle state.",
        "",
        "Borsh unit-enum discriminants, old \u2192 new (V2 was never deployed):",
        "",
        "| variant                  | old | new |",
        "|--------------------------|-----|-----|",
        "| Draft                    | 0   | 0   |",
        "| PendingAcceptance        | 1   | 1   |",
        "| PendingEmployerApproval  | \u2014   | 2   |",
        "| Active                   | 2   | 3   |",
        "| Completed                | 3   | 4   |",
        "| Declined                 | 4   | 5   |",
        "| Expired                  | 5   | 6   |",
        "| Cancelled                | 6   | 7   |",
        "| ActivationRejected       | \u2014   | 8   |",
        "| Disputed                 | \u2014   | 9   |",
        "| Resolved                 | \u2014   | 10  |",
        "",
        "`PendingEmployerApproval` is the employer-approval gate: the freelancer has",
        "accepted, the main stream has not started. `ActivationRejected` is the",
        "employer's \"no\" at that gate, distinct from `Declined` (the freelancer",
        "refused the offer). Events distinguish the two paths for indexers; status",
        "distinguishes them for on-chain logic."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "draft"
          },
          {
            "name": "pendingAcceptance"
          },
          {
            "name": "pendingEmployerApproval"
          },
          {
            "name": "active"
          },
          {
            "name": "completed"
          },
          {
            "name": "declined"
          },
          {
            "name": "expired"
          },
          {
            "name": "cancelled"
          },
          {
            "name": "activationRejected"
          },
          {
            "name": "disputed"
          },
          {
            "name": "resolved"
          }
        ]
      }
    },
    {
      "name": "createContractArgs",
      "docs": [
        "Caller-supplied terms.",
        "",
        "Grouped into a struct rather than a dozen positional parameters so that",
        "adding a term in a later phase cannot silently shift an existing argument's",
        "meaning at the call site.",
        "",
        "Every field here is a *term*. No lifecycle or accounting field is accepted",
        "from the caller: `status`, all five money counters, all unit counters, every",
        "lifecycle timestamp and both bumps are derived by the handler below."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "contractId",
            "docs": [
              "Employer-scoped identifier. Part of the PDA seeds, so reusing one for",
              "the same freelancer is rejected by the runtime, not by a check here."
            ],
            "type": "u64"
          },
          {
            "name": "paymentMode",
            "type": {
              "defined": {
                "name": "paymentMode"
              }
            }
          },
          {
            "name": "startMode",
            "type": {
              "defined": {
                "name": "startMode"
              }
            }
          },
          {
            "name": "totalAmount",
            "docs": [
              "Funded in full during this instruction."
            ],
            "type": "u64"
          },
          {
            "name": "acceptanceDeadline",
            "docs": [
              "Latest instant the freelancer may accept."
            ],
            "type": "i64"
          },
          {
            "name": "scheduledStartTime",
            "docs": [
              "Only meaningful when `start_mode == Scheduled`; normalized away",
              "otherwise. See `resolve`."
            ],
            "type": "i64"
          },
          {
            "name": "durationSeconds",
            "docs": [
              "Length of the contract term, in seconds."
            ],
            "type": "i64"
          },
          {
            "name": "checkpointInterval",
            "docs": [
              "Only meaningful when `payment_mode == Streaming`; normalized away",
              "otherwise. See `resolve`."
            ],
            "type": "i64"
          },
          {
            "name": "reviewDuration",
            "docs": [
              "Employer review window, and equally the freelancer's resubmission",
              "window."
            ],
            "type": "i64"
          },
          {
            "name": "activationReviewDuration",
            "docs": [
              "How long the employer has after freelancer acceptance to approve",
              "activation. Does not start the stream by itself."
            ],
            "type": "i64"
          },
          {
            "name": "maxRevisions",
            "type": "u8"
          },
          {
            "name": "trialAmount",
            "docs": [
              "Paid pre-activation trial reservation, included in `total_amount`.",
              "Zero means no trial. Must be strictly less than `total_amount` so the",
              "main contract retains a positive economic base."
            ],
            "type": "u64"
          },
          {
            "name": "resolver",
            "docs": [
              "Per-contract dispute resolver. Must differ from employer, freelancer,",
              "and the default pubkey. Frozen at creation."
            ],
            "type": "pubkey"
          },
          {
            "name": "metadataUri",
            "docs": [
              "Bounded reference to the off-chain contract record."
            ],
            "type": "string"
          },
          {
            "name": "metadataHash",
            "docs": [
              "Hash of that record, making it tamper-evident."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "createHourlyContractArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "contractId",
            "type": "u64"
          },
          {
            "name": "hourlyRate",
            "type": "u64"
          },
          {
            "name": "authorizedSeconds",
            "type": "u64"
          },
          {
            "name": "acceptanceDeadline",
            "type": "i64"
          },
          {
            "name": "durationSeconds",
            "type": "i64"
          },
          {
            "name": "reviewDuration",
            "type": "i64"
          },
          {
            "name": "activationReviewDuration",
            "type": "i64"
          },
          {
            "name": "maxRevisions",
            "type": "u8"
          },
          {
            "name": "trialAmount",
            "type": "u64"
          },
          {
            "name": "resolver",
            "type": "pubkey"
          },
          {
            "name": "metadataUri",
            "type": "string"
          },
          {
            "name": "metadataHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "disputeOpened",
      "docs": [
        "A party froze the contract into Disputed. No SPL transfer."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "contract",
            "type": "pubkey"
          },
          {
            "name": "employer",
            "type": "pubkey"
          },
          {
            "name": "freelancer",
            "type": "pubkey"
          },
          {
            "name": "initiator",
            "type": {
              "defined": {
                "name": "disputeParty"
              }
            }
          },
          {
            "name": "resolver",
            "type": "pubkey"
          },
          {
            "name": "disputedAt",
            "type": "i64"
          },
          {
            "name": "contestedAmount",
            "type": "u64"
          },
          {
            "name": "releasedAmount",
            "type": "u64"
          },
          {
            "name": "streamReleasedAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "disputeParty",
      "docs": [
        "Who opened an on-chain dispute. `None` until `open_dispute` / trial reject."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "none"
          },
          {
            "name": "employer"
          },
          {
            "name": "freelancer"
          }
        ]
      }
    },
    {
      "name": "disputeResolved",
      "docs": [
        "The contract resolver allocated the contested remainder. No SPL transfer."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "contract",
            "type": "pubkey"
          },
          {
            "name": "employer",
            "type": "pubkey"
          },
          {
            "name": "freelancer",
            "type": "pubkey"
          },
          {
            "name": "resolver",
            "type": "pubkey"
          },
          {
            "name": "resolvedAt",
            "type": "i64"
          },
          {
            "name": "contestedAmount",
            "type": "u64"
          },
          {
            "name": "freelancerContestedAward",
            "type": "u64"
          },
          {
            "name": "employerContestedAward",
            "type": "u64"
          },
          {
            "name": "finalFreelancerEntitlement",
            "type": "u64"
          },
          {
            "name": "finalEmployerEntitlement",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "employerRefundClaimed",
      "docs": [
        "SPL tokens left escrow back to the employer. Real token movement."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "contract",
            "type": "pubkey"
          },
          {
            "name": "employer",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "refundedAmount",
            "type": "u64"
          },
          {
            "name": "remainingRefundable",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "freelancerWithdrawal",
      "docs": [
        "SPL tokens left escrow for the freelancer. Real token movement."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "contract",
            "type": "pubkey"
          },
          {
            "name": "freelancer",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "withdrawnAmount",
            "type": "u64"
          },
          {
            "name": "remainingEntitlement",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "hourlyContractCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "contract",
            "type": "pubkey"
          },
          {
            "name": "employer",
            "type": "pubkey"
          },
          {
            "name": "freelancer",
            "type": "pubkey"
          },
          {
            "name": "contractId",
            "type": "u64"
          },
          {
            "name": "hourlyRate",
            "type": "u64"
          },
          {
            "name": "authorizedSeconds",
            "type": "u64"
          },
          {
            "name": "mainAmount",
            "type": "u64"
          },
          {
            "name": "trialAmount",
            "type": "u64"
          },
          {
            "name": "totalAmount",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "hourlyContractEnded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "contract",
            "type": "pubkey"
          },
          {
            "name": "employer",
            "type": "pubkey"
          },
          {
            "name": "freelancer",
            "type": "pubkey"
          },
          {
            "name": "endedAt",
            "type": "i64"
          },
          {
            "name": "freelancerSettlementAmount",
            "type": "u64"
          },
          {
            "name": "employerRefundableAmount",
            "type": "u64"
          },
          {
            "name": "releasedAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "hourlySession",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "contract",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u32"
          },
          {
            "name": "startedAt",
            "type": "i64"
          },
          {
            "name": "stoppedAt",
            "type": "i64"
          },
          {
            "name": "durationSeconds",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "hourlySessionStatus"
              }
            }
          },
          {
            "name": "workLogHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "workLogUri",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "hourlySessionRecorded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "contract",
            "type": "pubkey"
          },
          {
            "name": "session",
            "type": "pubkey"
          },
          {
            "name": "freelancer",
            "type": "pubkey"
          },
          {
            "name": "sessionIndex",
            "type": "u32"
          },
          {
            "name": "stoppedAt",
            "type": "i64"
          },
          {
            "name": "creditedDuration",
            "type": "u64"
          },
          {
            "name": "approvedSeconds",
            "type": "u64"
          },
          {
            "name": "releaseDelta",
            "type": "u64"
          },
          {
            "name": "releasedAmount",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "hourlySessionStatus"
              }
            }
          },
          {
            "name": "materializedByDispute",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "hourlySessionStarted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "contract",
            "type": "pubkey"
          },
          {
            "name": "session",
            "type": "pubkey"
          },
          {
            "name": "freelancer",
            "type": "pubkey"
          },
          {
            "name": "sessionIndex",
            "type": "u32"
          },
          {
            "name": "startedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "hourlySessionStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "recorded"
          },
          {
            "name": "void"
          }
        ]
      }
    },
    {
      "name": "hourlyState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "contract",
            "type": "pubkey"
          },
          {
            "name": "hourlyRate",
            "type": "u64"
          },
          {
            "name": "authorizedSeconds",
            "type": "u64"
          },
          {
            "name": "approvedSeconds",
            "type": "u64"
          },
          {
            "name": "sessionCount",
            "type": "u32"
          },
          {
            "name": "activeSessionIndex",
            "type": "u32"
          },
          {
            "name": "maxSessionSeconds",
            "type": "u64"
          },
          {
            "name": "minSessionSeconds",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          }
        ]
      }
    },
    {
      "name": "milestoneAdded",
      "docs": [
        "One milestone was defined on a draft contract.",
        "",
        "`allocated_amount` is the running total after this milestone, so an indexer",
        "can tell how much of the escrow is still unallocated without re-reading the",
        "contract. Titles and specifications are not here: they live in the",
        "contract's off-chain record."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "contract",
            "type": "pubkey"
          },
          {
            "name": "workUnit",
            "type": "pubkey"
          },
          {
            "name": "index",
            "type": "u32"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "dueOffsetSeconds",
            "type": "i64"
          },
          {
            "name": "allocatedAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "paymentMode",
      "docs": [
        "How compensation is structured and released.",
        "",
        "The three modes are mutually exclusive: a streaming contract never has",
        "milestones, and a milestone/fixed contract never has checkpoints. That",
        "exclusivity is what lets a single `WorkUnit` type and a single index space",
        "serve all three."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "streaming"
          },
          {
            "name": "milestone"
          },
          {
            "name": "fixed"
          },
          {
            "name": "hourly"
          }
        ]
      }
    },
    {
      "name": "releaseTrigger",
      "docs": [
        "Why a work unit's amount became released.",
        "",
        "A typed \"not yet\" variant rather than a sentinel value; only meaningful",
        "once `WorkUnitStatus::Released`."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "notReleased"
          },
          {
            "name": "employerApproval"
          },
          {
            "name": "reviewTimeout"
          }
        ]
      }
    },
    {
      "name": "startMode",
      "docs": [
        "When the main earning clock starts.",
        "",
        "Discriminants are stable: `OnActivation` is 0, `Scheduled` is 1. This was",
        "previously named `OnAcceptance`; it was renamed before V2 deployment because",
        "freelancer acceptance no longer starts the stream."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "onActivation"
          },
          {
            "name": "scheduled"
          }
        ]
      }
    },
    {
      "name": "stream",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "employer",
            "type": "pubkey"
          },
          {
            "name": "worker",
            "type": "pubkey"
          },
          {
            "name": "tokenMint",
            "type": "pubkey"
          },
          {
            "name": "streamId",
            "type": "u64"
          },
          {
            "name": "totalAmount",
            "type": "u64"
          },
          {
            "name": "withdrawnAmount",
            "type": "u64"
          },
          {
            "name": "isCancelled",
            "type": "bool"
          },
          {
            "name": "startTime",
            "type": "i64"
          },
          {
            "name": "endTime",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "streamAccrualReleased",
      "docs": [
        "Time-based streaming earnings were materialized into released accounting.",
        "No SPL transfer."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "contract",
            "type": "pubkey"
          },
          {
            "name": "freelancer",
            "type": "pubkey"
          },
          {
            "name": "newlyReleased",
            "type": "u64"
          },
          {
            "name": "cumulativeStreamReleased",
            "type": "u64"
          },
          {
            "name": "totalReleased",
            "type": "u64"
          },
          {
            "name": "accrualTime",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "termsFinalized",
      "docs": [
        "A milestone contract's terms became immutable and the contract is now",
        "offered to the freelancer."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "contract",
            "type": "pubkey"
          },
          {
            "name": "employer",
            "type": "pubkey"
          },
          {
            "name": "workUnitCount",
            "type": "u32"
          },
          {
            "name": "totalAmount",
            "type": "u64"
          },
          {
            "name": "finalizedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "trialApproved",
      "docs": [
        "The employer approved the trial. Compensation is released, not withdrawn."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "contract",
            "type": "pubkey"
          },
          {
            "name": "trialWorkUnit",
            "type": "pubkey"
          },
          {
            "name": "employer",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "approvedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "trialConfigured",
      "docs": [
        "A paid trial was configured at contract creation."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "contract",
            "type": "pubkey"
          },
          {
            "name": "trialWorkUnit",
            "type": "pubkey"
          },
          {
            "name": "employer",
            "type": "pubkey"
          },
          {
            "name": "freelancer",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "trialRejected",
      "docs": [
        "The employer rejected submitted trial work. No tokens moved."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "contract",
            "type": "pubkey"
          },
          {
            "name": "trialWorkUnit",
            "type": "pubkey"
          },
          {
            "name": "employer",
            "type": "pubkey"
          },
          {
            "name": "freelancer",
            "type": "pubkey"
          },
          {
            "name": "rejectedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "trialRevisionRequested",
      "docs": [
        "The employer requested a trial revision."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "contract",
            "type": "pubkey"
          },
          {
            "name": "trialWorkUnit",
            "type": "pubkey"
          },
          {
            "name": "employer",
            "type": "pubkey"
          },
          {
            "name": "revisionCount",
            "type": "u8"
          },
          {
            "name": "actionDeadline",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "trialSubmitted",
      "docs": [
        "The freelancer submitted (or resubmitted) trial work."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "contract",
            "type": "pubkey"
          },
          {
            "name": "trialWorkUnit",
            "type": "pubkey"
          },
          {
            "name": "freelancer",
            "type": "pubkey"
          },
          {
            "name": "submittedAt",
            "type": "i64"
          },
          {
            "name": "actionDeadline",
            "type": "i64"
          },
          {
            "name": "revisionCount",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "workUnit",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "docs": [
              "On-chain layout version, for forward migration."
            ],
            "type": "u8"
          },
          {
            "name": "contract",
            "docs": [
              "Parent contract. Stored in addition to being a PDA seed: the seed",
              "constraint proves derivation and this field enables a `has_one` check,",
              "so cross-contract substitution is caught two independent ways."
            ],
            "type": "pubkey"
          },
          {
            "name": "index",
            "docs": [
              "Zero-based index within the parent contract, and part of the PDA seeds,",
              "which makes a duplicate unit unrepresentable."
            ],
            "type": "u32"
          },
          {
            "name": "kind",
            "type": {
              "defined": {
                "name": "workUnitKind"
              }
            }
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "workUnitStatus"
              }
            }
          },
          {
            "name": "amount",
            "docs": [
              "Amount credited to `Contract::released_amount` when this unit is",
              "released. Immutable once submitted."
            ],
            "type": "u64"
          },
          {
            "name": "periodStart",
            "docs": [
              "Inclusive start of the streaming period. `Checkpoint` only."
            ],
            "type": "i64"
          },
          {
            "name": "periodEnd",
            "docs": [
              "Exclusive end of the streaming period. `Checkpoint` only."
            ],
            "type": "i64"
          },
          {
            "name": "dueOffsetSeconds",
            "docs": [
              "Seconds after `Contract::start_time` when this deliverable is due.",
              "`Milestone` / `Fixed` only. Always a duration, never a calendar",
              "timestamp, so the same field is valid under both `OnActivation` and",
              "`Scheduled`. Absolute due time is `start_time + due_offset_seconds`",
              "once the contract has actually started."
            ],
            "type": "i64"
          },
          {
            "name": "submittedAt",
            "docs": [
              "When the current submission was made."
            ],
            "type": "i64"
          },
          {
            "name": "actionDeadline",
            "docs": [
              "Deadline for whichever party must act next, determined by `status`:",
              "",
              "- `Submitted`: the employer's review deadline. Once it passes, review",
              "timeout finalization may release the amount.",
              "- `Revising`: the freelancer's resubmission deadline. Once it passes,",
              "the employer may void the stale unit, which is what stops an absent",
              "freelancer from blocking cancellation forever.",
              "- any other status: not read, and never used as a lifecycle predicate."
            ],
            "type": "i64"
          },
          {
            "name": "approvedAt",
            "docs": [
              "When the employer signed an approval."
            ],
            "type": "i64"
          },
          {
            "name": "releasedAt",
            "docs": [
              "When the amount was credited to the contract's released total."
            ],
            "type": "i64"
          },
          {
            "name": "revisionCount",
            "docs": [
              "Revision cycles consumed, bounded by `Contract::max_revisions`."
            ],
            "type": "u8"
          },
          {
            "name": "releaseTrigger",
            "docs": [
              "Why the unit was released. Only meaningful once `status == Released`."
            ],
            "type": {
              "defined": {
                "name": "releaseTrigger"
              }
            }
          },
          {
            "name": "submissionHash",
            "docs": [
              "Hash of the off-chain deliverable, making it tamper-evident."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "reserved",
            "docs": [
              "Upgrade headroom; see `Contract::reserved`."
            ],
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          },
          {
            "name": "submissionUri",
            "docs": [
              "Bounded pointer to the off-chain deliverable. Work files themselves are",
              "never stored on-chain."
            ],
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "workUnitApproved",
      "docs": [
        "The employer approved a submitted work unit. Compensation is released, not withdrawn."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "contract",
            "type": "pubkey"
          },
          {
            "name": "workUnit",
            "type": "pubkey"
          },
          {
            "name": "employer",
            "type": "pubkey"
          },
          {
            "name": "workUnitIndex",
            "type": "u32"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "approvedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "workUnitKind",
      "docs": [
        "Which flavour of work unit this account represents.",
        "",
        "Checkpoints are created by the freelancer at submission time with an amount",
        "derived from the agreed vesting formula. Milestones are created by the",
        "employer before acceptance with a negotiated amount."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "checkpoint"
          },
          {
            "name": "milestone"
          },
          {
            "name": "fixed"
          },
          {
            "name": "trial"
          }
        ]
      }
    },
    {
      "name": "workUnitReviewTimedOut",
      "docs": [
        "Review timed out and the submitted unit was auto-released. No SPL transfer."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "contract",
            "type": "pubkey"
          },
          {
            "name": "workUnit",
            "type": "pubkey"
          },
          {
            "name": "workUnitIndex",
            "type": "u32"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "releasedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "workUnitRevisionRequested",
      "docs": [
        "The employer requested a bounded resubmission of post-activation work."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "contract",
            "type": "pubkey"
          },
          {
            "name": "workUnit",
            "type": "pubkey"
          },
          {
            "name": "employer",
            "type": "pubkey"
          },
          {
            "name": "workUnitIndex",
            "type": "u32"
          },
          {
            "name": "revisionCount",
            "type": "u8"
          },
          {
            "name": "actionDeadline",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "workUnitStaleRevisionVoided",
      "docs": [
        "The employer voided a stale Revising main deliverable. No SPL transfer."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "contract",
            "type": "pubkey"
          },
          {
            "name": "workUnit",
            "type": "pubkey"
          },
          {
            "name": "employer",
            "type": "pubkey"
          },
          {
            "name": "workUnitIndex",
            "type": "u32"
          },
          {
            "name": "voidedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "workUnitStatus",
      "docs": [
        "Authoritative work unit lifecycle state."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "defined"
          },
          {
            "name": "submitted"
          },
          {
            "name": "revising"
          },
          {
            "name": "released"
          },
          {
            "name": "void"
          }
        ]
      }
    },
    {
      "name": "workUnitSubmitted",
      "docs": [
        "The freelancer submitted (or resubmitted) post-activation work."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "contract",
            "type": "pubkey"
          },
          {
            "name": "workUnit",
            "type": "pubkey"
          },
          {
            "name": "freelancer",
            "type": "pubkey"
          },
          {
            "name": "workUnitIndex",
            "type": "u32"
          },
          {
            "name": "submittedAt",
            "type": "i64"
          },
          {
            "name": "actionDeadline",
            "type": "i64"
          },
          {
            "name": "revisionCount",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
