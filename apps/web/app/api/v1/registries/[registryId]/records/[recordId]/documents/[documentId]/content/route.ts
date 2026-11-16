import {
  handleApiDocumentContent,
  publicApiOptions,
} from "../../../../../../../../../../lib/public-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const OPTIONS = publicApiOptions;

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      registryId: string;
      recordId: string;
      documentId: string;
    }>;
  },
) {
  const {
    registryId,
    recordId,
    documentId,
  } = await context.params;

  return handleApiDocumentContent(
    registryId,
    recordId,
    documentId,
  );
}
