const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/playerHarness.cjs');

test('Apple 有原生 HLS 时不创建 MSE 解码管线', () => {
  const h = harness();
  h.session.start();
  assert.equal(h.Hls.instances.length, 0);
  assert.match(h.video.src, /api\/stream/);
  h.session.destroy();
  assert.equal(h.timers.size, 0);
});

test('原生不支持 HLS 时回到 hls.js', () => {
  const h = harness({ native: false });
  h.session.start();
  assert.equal(h.Hls.instances.length, 1);
  h.session.destroy();
});

test('非 Apple 的默认播放管线仍为 hls.js', () => {
  const h = harness({ preferNative: false });
  h.session.start();
  assert.equal(h.Hls.instances.length, 1);
  h.session.destroy();
});

test('原生不支持编码时只切换一次到 hls.js', () => {
  const h = harness();
  h.session.start();
  h.video.fail(4);
  assert.equal(h.Hls.instances.length, 1);
  assert.equal(h.fetchCalls, 0);
  assert.deepEqual(h.errors, []);
  h.session.destroy();
});

test('解码恢复保留进度、倍速和播放意图', () => {
  const h = harness();
  h.session.start();
  h.video.ready();
  h.video.currentTime = 124.5;
  h.video.playbackRate = 1.5;
  h.video.defaultPlaybackRate = 1.25;
  h.video.fail(3);
  h.video.ready();
  assert.equal(h.video.currentTime, 124.5);
  assert.equal(h.video.playbackRate, 1.5);
  assert.equal(h.video.defaultPlaybackRate, 1.25);
  assert.equal(h.video.paused, false);
  assert.equal(h.fetchCalls, 0);
  h.session.destroy();
});

test('暂停状态下解码恢复不擅自播放', () => {
  const h = harness();
  h.session.start();
  h.video.ready();
  h.video.currentTime = 80;
  h.video.pause();
  const plays = h.video.playCalls;
  h.video.fail(3);
  h.video.ready();
  assert.equal(h.video.currentTime, 80);
  assert.equal(h.video.paused, true);
  assert.equal(h.video.playCalls, plays);
  h.session.destroy();
});

test('迟到的加载暂停事件不会覆盖新的播放意图', () => {
  const h = harness();
  h.session.start();
  h.video.ready();
  h.video.currentTime = 80;
  h.video.dispatchEvent(new Event('pause'));
  h.video.fail(3);
  h.video.ready();
  assert.equal(h.video.currentTime, 80);
  assert.equal(h.video.paused, false);
  h.session.destroy();
});

test('网络重试不会耗尽媒体恢复次数', () => {
  const h = harness({ native: false });
  h.session.start();
  const engine = h.Hls.instances[0];
  engine.fail('networkError', 503);
  h.advance(1000);
  engine.fail('networkError', 503);
  h.advance(2000);
  assert.equal(engine.starts, 2);
  h.video.error = { code: 3 };
  engine.fail('mediaError');
  assert.equal(engine.recoveries, 1);
  assert.deepEqual(h.errors, []);
  h.session.destroy();
});

test('清单加载失败重新加载清单，而非只 startLoad', () => {
  const h = harness({ native: false });
  h.session.start();
  const engine = h.Hls.instances[0];
  engine.fail('networkError', 503, { details: 'manifestLoadError' });
  h.advance(1000);
  assert.equal(engine.sources.length, 2);
  assert.equal(engine.starts, 0);
  h.session.destroy();
});

test('HTTP 403 立即停止并提示访问限制', () => {
  const h = harness({ native: false });
  h.session.start();
  const engine = h.Hls.instances[0];
  engine.fail('networkError', 403);
  h.advance(10000);
  assert.equal(engine.starts, 0);
  assert.equal(h.errors.length, 1);
  assert.match(h.errors[0], /HTTP 403/);
  assert.equal(h.timers.size, 0);
});

test('非致命 hls.js 告警不触发外部恢复', () => {
  const h = harness({ native: false });
  h.session.start();
  const engine = h.Hls.instances[0];
  engine.fail('mediaError', undefined, { fatal: false });
  assert.equal(engine.recoveries, 0);
  assert.equal(h.Hls.instances.length, 1);
  assert.deepEqual(h.errors, []);
  h.session.destroy();
});

test('hls.js 媒体失败可切到原生并保留当前位置', () => {
  const h = harness({ preferNative: false });
  h.session.start();
  h.video.ready();
  h.video.currentTime = 100;
  const engine = h.Hls.instances[0];
  engine.fail('mediaError');
  h.video.ready();
  assert.equal(engine.destroyed, true);
  assert.match(h.video.src, /api\/stream/);
  assert.equal(h.video.currentTime, 100);
  h.session.destroy();
});

test('恢复期间再次失败不能丢失最初进度', () => {
  const h = harness();
  h.session.start();
  h.video.ready();
  h.video.currentTime = 150;
  h.video.fail(3);
  h.video.fail(3);
  h.video.ready();
  assert.equal(h.video.currentTime, 150);
  assert.equal(h.Hls.instances.length, 1);
  h.session.destroy();
});

test('连续解码错误达到上限后停止，不无限重载', () => {
  const h = harness({ native: false });
  h.session.start();
  const engine = h.Hls.instances[0];
  for (let i = 0; i < 5; i++) {
    h.video.error = { code: 3 };
    engine.fail('mediaError');
  }
  assert.equal(engine.recoveries, 2);
  assert.equal(h.errors.length, 1);
  assert.match(h.errors[0], /解码/);
  assert.doesNotMatch(h.errors[0], /地域|HTTP/);
  assert.equal(h.timers.size, 0);
});

test('原生直链的“不支持”错误可识别 HTTP 403', async () => {
  const h = harness({ session: { isHls: false }, fetch: () => Promise.resolve({ status: 403 }) });
  h.session.start();
  h.video.fail(4);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.errors.length, 1);
  assert.match(h.errors[0], /HTTP 403/);
  assert.equal(h.timers.size, 0);
});

test('原生直链可访问时准确提示编码不支持', async () => {
  const h = harness({ session: { isHls: false } });
  h.session.start();
  h.video.fail(4);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.errors.length, 1);
  assert.match(h.errors[0], /编码不受支持/);
  assert.equal(h.timers.size, 0);
});

test('卸载取消延迟重试', () => {
  const h = harness({ native: false });
  h.session.start();
  const engine = h.Hls.instances[0];
  engine.fail('networkError', 503);
  h.session.destroy();
  h.advance(10000);
  assert.equal(engine.starts, 0);
  assert.equal(h.timers.size, 0);
});

test('卸载取消网络探测，迟到的错误不能污染下一个视频', async () => {
  let complete, signal;
  const h = harness({ fetch: (_url, init) => {
    signal = init.signal;
    return new Promise((resolve) => { complete = resolve; });
  } });
  h.session.start();
  h.video.fail(2);
  assert.equal(h.fetchCalls, 1);
  h.session.destroy();
  assert.equal(signal.aborted, true);
  complete({ status: 403 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(h.errors, []);
  assert.equal(h.timers.size, 0);
});
