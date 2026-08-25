import { execFile } from "child_process";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type AppointmentVideoUploadKind = "mp4" | "mov";

type VideoProbe = {
  streams?: Array<{
    index?: number;
    codec_type?: string;
    codec_name?: string;
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
  const video = probe.streams?.find((stream) => stream.codec_type === "video") || probe.streams?.[0];
  return (
    video?.color_transfer === "smpte2084" ||
    video?.color_transfer === "arib-std-b67" ||
    video?.color_primaries === "bt2020"
  );
}

export function appointmentMovFfmpegArgs(
  inputPath: string,
  outputPath: string,
  hdr: boolean,
  audioStreamIndex: number | null = null
) {
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
    ...(audioStreamIndex == null ? [] : ["-map", `0:${audioStreamIndex}`]),
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
    ...(audioStreamIndex == null ? [] : ["-c:a", "aac", "-b:a", "128k"]),
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
      "-show_entries",
      "stream=index,codec_type,codec_name,color_transfer,color_primaries",
      "-of",
      "json",
      inputPath,
    ],
    { timeout: 30_000, maxBuffer: 1024 * 1024 }
  );
  const probe = JSON.parse(stdout) as VideoProbe;
  const video = probe.streams?.find((stream) => stream.codec_type === "video");
  if (!video) throw new Error("Geen videostream gevonden");
  const audio = probe.streams?.find(
    (stream) =>
      stream.codec_type === "audio" &&
      typeof stream.index === "number" &&
      Boolean(stream.codec_name) &&
      !["none", "unknown"].includes(stream.codec_name!)
  );

  await execFileAsync(
    "ffmpeg",
    appointmentMovFfmpegArgs(inputPath, outputPath, isHdrVideoProbe(probe), audio?.index ?? null),
    {
      timeout: 180_000,
      maxBuffer: 2 * 1024 * 1024,
    }
  );
}
