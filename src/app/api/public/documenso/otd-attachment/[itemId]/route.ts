import { NextResponse } from "next/server";
import { downloadOtdAttachmentItem } from "@/lib/documenso";

function safeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._ -]/g, "_") || "bijlage.pdf";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await params;

  try {
    const attachment = await downloadOtdAttachmentItem(itemId);

    return new NextResponse(new Uint8Array(attachment.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${safeFilename(attachment.filename)}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bijlage niet gevonden" },
      { status: 404 },
    );
  }
}
