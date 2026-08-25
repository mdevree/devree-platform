import { execFile } from "child_process";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type AppointmentVideoUploadKind = "mp4" | "mov";

type VideoProbe = {
  streams?: Array<{
    color_transfer?: string;
    color_primaries?: string;
  }>;
};

export function appointmentVideoUploadKind(name: string, mimeType: string): AppointmentVideoUploadKind | null {
  const extension = path.extname(name).toLowerCase();
  const normalizedMimeType = mimeType.toLowerCase();

  if (extension === ".mp4" || (!extension && normalizedMimeType === "video/mp4")) return "mp4";
  if (
    extension === ".mov" ||
    (!extension && ["video/quicktime", "video/mov", "video/x-quicktime"].includes(normalizedMimeType))
  ) {
    return "mov";
  }
  return null;
}

export function isHdrVideoProbe(probe: VideoProbe) {
  const video = probe.streams?.[0];
  return (
    video?.color_transfer === "smpte2084" ||
    video?.color_transfer === "arib-std-b67" ||
    video?.color_primaries === "bt2020"
  );
}

export function appointmentMovFfmpegArgs(inputPath: string, outputPath: string, hdr: boolean) {
  const filter = hdr
    ? [
        "zscale=t=linear:npl=100",
        "format=gbrpf32le",
        "zscale=p=bt709",
        "tonemap=tonemap=mobius:param=0.3",
        "zscale=t=bt709:m=bt709:r=tv",
        "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "format=yuv420p",
      ].join(",")
    : "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p";

  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-map_metadata",
    "-1",
    "-vf",
    filter,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    ...(hdr
      ? [
          "-color_primaries",
          "bt709",
          "-color_trc",
          "bt709",
          "-colorspace",
          "bt709",
          "-color_range",
          "tv",
        ]
      : []),
    outputPath,
  ];
}

export async function convertAppointmentMovToMp4(inputPath: string, outputPath: string) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=color_transfer,color_primaries",
      "-of",
      "json",
      inputPath,
    ],
    { timeout: 30_000, maxBuffer: 1024 * 1024 }
  );
  const probe = JSON.parse(stdout) as VideoProbe;
  if (!probe.streams?.length) throw new Error("Geen videostream gevonden");

  await execFileAsync("ffmpeg", appointmentMovFfmpegArgs(inputPath, outputPath, isHdrVideoProbe(probe)), {
    timeout: 180_000,
    maxBuffer: 2 * 1024 * 1024,
  });
}
