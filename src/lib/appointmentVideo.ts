import { execFile } from "child_process";
import { unlink } from "fs/promises";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type AppointmentVideoUploadKind = "mp4" | "mov";

export const APPOINTMENT_POSTER_TIMESTAMPS = [0.2, 0.6, 1.0] as const;

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

export function appointmentPosterPath(videoPath: string, index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= APPOINTMENT_POSTER_TIMESTAMPS.length) {
    throw new Error("Ongeldige posterindex");
  }
  return `${videoPath}.poster-${index}.jpg`;
}

export function appointmentPosterPaths(videoPath: string) {
  return APPOINTMENT_POSTER_TIMESTAMPS.map((_, index) => appointmentPosterPath(videoPath, index));
}

export async function generateAppointmentPosters(videoPath: string) {
  const outputPaths = appointmentPosterPaths(videoPath);
  try {
    for (const [index, outputPath] of outputPaths.entries()) {
      await execFileAsync(
        "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-ss",
          String(APPOINTMENT_POSTER_TIMESTAMPS[index]),
          "-i",
          videoPath,
          "-frames:v",
          "1",
          "-vf",
          "scale='min(960,iw)':-2",
          "-q:v",
          "3",
          outputPath,
        ],
        { timeout: 30_000, maxBuffer: 1024 * 1024 }
      );
    }
    return outputPaths;
  } catch (error) {
    await Promise.all(outputPaths.map((outputPath) => unlink(outputPath).catch(() => {})));
    throw error;
  }
}

export async function removeAppointmentVideoFiles(videoPath: string) {
  await Promise.all([
    unlink(videoPath).catch(() => {}),
    ...appointmentPosterPaths(videoPath).map((posterPath) => unlink(posterPath).catch(() => {})),
  ]);
}
