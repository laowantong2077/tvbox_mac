const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness, ranges } = require('./helpers/playerHarness.cjs');

function snapshot(time) {
  return { time, playing: true, rate: 1.5, defaultRate: 1 };
}

test('直播恢复到当前窗口，避免请求已过期分片', () => {
  const h = harness();
  h.video.duration = Infinity;
  h.video.seekable = ranges([[500, 600]]);
  assert.equal(h.restorePlayback(h.video, snapshot(400)), true);
  assert.equal(h.video.currentTime, 500);
});

test('直播窗口未就绪时等待后续 canplay', () => {
  const h = harness();
  h.video.duration = Infinity;
  h.video.seekable = ranges();
  assert.equal(h.restorePlayback(h.video, snapshot(400)), false);
  assert.equal(h.video.currentTime, 0);
});

test('恢复不落入不可 seek 的分片空洞', () => {
  const h = harness();
  h.video.duration = Infinity;
  h.video.seekable = ranges([[0, 10], [20, 30]]);
  assert.equal(h.restorePlayback(h.video, snapshot(15)), true);
  assert.equal(h.video.currentTime, 20);
});

test('有缓冲但视频帧停滞时重建并保留进度', () => {
  const h = harness();
  h.session.start();
  h.video.ready();
  h.video.currentTime = 90;
  const loads = h.video.loads;
  h.advance(10000);
  assert.equal(h.video.loads, loads + 1);
  h.video.ready();
  assert.equal(h.video.currentTime, 90);
  h.session.destroy();
});

test('视频帧正常输出不会误触发重载', () => {
  const h = harness();
  h.session.start();
  h.video.ready();
  const loads = h.video.loads;
  for (let i = 0; i < 20; i++) {
    h.video.frames += 50;
    h.advance(2000);
  }
  assert.equal(h.video.loads, loads);
  h.session.destroy();
});

test('暂停、拖动、后台、音频源及缺少缓冲不触发帧恢复', () => {
  const states = [
    (h) => h.video.pause(),
    (h) => { h.video.seeking = true; },
    (h) => { h.document.hidden = true; },
    (h) => { h.video.videoWidth = 0; },
    (h) => { h.video.buffered = ranges(); },
  ];
  for (const prepare of states) {
    const h = harness();
    h.session.start();
    h.video.ready();
    const loads = h.video.loads;
    prepare(h);
    h.advance(60000);
    assert.equal(h.video.loads, loads);
    assert.deepEqual(h.errors, []);
    h.session.destroy();
  }
});

test('无媒体错误的 MSE 帧停滞重建会话，不调用 recoverMediaError', () => {
  const h = harness({ native: false });
  h.session.start();
  h.video.ready();
  h.video.currentTime = 50;
  const first = h.Hls.instances[0];
  h.advance(10000);
  assert.equal(first.recoveries, 0);
  assert.equal(first.destroyed, true);
  assert.equal(h.Hls.instances.length, 2);
  h.video.ready();
  assert.equal(h.video.currentTime, 50);
  h.session.destroy();
});

test('原生音轨可切换，字幕索引跳过元数据轨', () => {
  const h = harness();
  h.video.audioTracks = [
    { label: '中文', language: 'zh', enabled: true },
    { label: '英文', language: 'en', enabled: false },
  ];
  h.video.textTracks = [
    { kind: 'metadata', label: '', mode: 'hidden' },
    { kind: 'subtitles', label: '中文', mode: 'disabled' },
    { kind: 'captions', label: '英文', mode: 'disabled' },
  ];
  h.setNativeAudio(h.video, 1);
  h.setNativeSubtitle(h.video, 2);
  const info = h.nativeTrackInfo(h.video);
  assert.equal(info.audioTrack, 1);
  assert.equal(info.subTracks.length, 2);
  assert.equal(info.subTracks[0].index, 1);
  assert.equal(info.subTrack, 2);
  assert.equal(h.video.textTracks[2].mode, 'hidden');
  h.setNativeSubtitle(h.video, -1);
  assert.equal(h.nativeTrackInfo(h.video).subTrack, -1);
});
