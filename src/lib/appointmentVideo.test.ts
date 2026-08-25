import assert from "node:assert/strict";
import test from "node:test";
import {
  appointmentMovFfmpegArgs,
  appointmentVideoUploadKind,
  isHdrVideoProbe,
} from "./appointmentVideo";

test("accepteert MP4 en MOV op extensie of MIME-type", () => {
  assert.equal(appointmentVideoUploadKind("bevestiging.mp4", "video/mp4"), "mp4");
  assert.equal(appointmentVideoUploadKind("bevestiging.MOV", "video/quicktime"), "mov");
  assert.equal(appointmentVideoUploadKind("bevestiging.mov", ""), "mov");
  assert.equal(appointmentVideoUploadKind("bevestiging.avi", "video/x-msvideo"), null);
});

test("herkent gangbare HDR-kleurprofielen", () => {
  assert.equal(isHdrVideoProbe({ streams: [{ color_transfer: "smpte2084", color_primaries: "bt2020" }] }), true);
  assert.equal(isHdrVideoProbe({ streams: [{ color_transfer: "arib-std-b67" }] }), true);
  assert.equal(isHdrVideoProbe({ streams: [{ color_transfer: "bt709", color_primaries: "bt709" }] }), false);
});

test("voegt alleen voor HDR tonemapping en BT.709-metadata toe", () => {
  const hdrArgs = appointmentMovFfmpegArgs("in.mov", "out.mp4", true);
  const sdrArgs = appointmentMovFfmpegArgs("in.mov", "out.mp4", false);

  assert.match(hdrArgs[hdrArgs.indexOf("-vf") + 1], /tonemap=tonemap=mobius/);
  assert.equal(hdrArgs.includes("-color_primaries"), true);
  assert.equal(sdrArgs[hdrArgs.indexOf("-vf") + 1].includes("tonemap="), false);
  assert.equal(sdrArgs.includes("-color_primaries"), false);
  assert.deepEqual(hdrArgs.slice(-1), ["out.mp4"]);
});
