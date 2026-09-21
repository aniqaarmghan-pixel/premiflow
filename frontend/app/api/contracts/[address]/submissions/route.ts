import { NextResponse } from "next/server";

import {
  handleRouteError,
  requireMessageParticipant,
  requireMutatingOrigin,
} from "@/lib/server/api-guard";
import { HttpError, readJsonObject } from "@/lib/server/http";
import {
  SubmissionAccessError,
  SubmissionValidationError,
  isAuthorizedSubmissionWriter,
  listWorkSubmissions,
  persistConfirmedWorkSubmission,
} from "@/lib/server/submissions/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validationError(err: unknown) {
  if (err instanceof SubmissionValidationError) {
    return new HttpError(400, "invalid_submission", err.message);
  }
  if (err instanceof SubmissionAccessError) {
    return new HttpError(403, "forbidden", err.message);
  }
  return err;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await context.params;
    const { stores } = await requireMessageParticipant(request, address);
    const result = await listWorkSubmissions(
      stores.submissions,
      {
        contractAddress: address,
      },
      stores.attachments
    );
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(validationError(err));
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ address: string }> }
) {
  try {
    requireMutatingOrigin(request);
    const { address } = await context.params;
    const { stores, session, parties } = await requireMessageParticipant(
      request,
      address
    );
    if (!isAuthorizedSubmissionWriter(session.walletAddress, parties)) {
      throw new SubmissionAccessError(
        "Only the freelancer can save delivery history."
      );
    }
    const body = await readJsonObject(request);
    const result = await persistConfirmedWorkSubmission(stores, {
      contractAddress: address,
      sessionWallet: session.walletAddress,
      parties,
      body,
    });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (err) {
    return handleRouteError(validationError(err));
  }
}
