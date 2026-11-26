// 外刊精读 · Android 打包脚本（不依赖 Gradle / Android Studio 工程）
//
//   node android/build-android.mjs              生成 APK
//   node android/build-android.mjs --install    生成后直接安装到已连接的手机或模拟器
//   node android/build-android.mjs --debug      保留中间产物（build/ 目录）
//   node android/build-android.mjs --debug-webview  仅用于连接设备运行冒烟测试
//
// 环境要求：JDK 17+（JAVA_HOME）、Android SDK（ANDROID_HOME，需 build-tools 与 platforms/android-34）。
// 流程：aapt2 编译资源 → aapt2 链接（含 assets）→ javac → d8 生成 dex → 塞进 APK →
//       zipalign 对齐 → apksigner 签名（首次自动生成 debug.keystore）。
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, cpSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const BUILD = join(HERE, 'build');
const DIST = join(ROOT, 'dist');
const ASSETS = join(HERE, 'assets');
const GEN = join(BUILD, 'gen');
const CLASSES = join(BUILD, 'classes');
const DEX = join(BUILD, 'dex');
const KEYSTORE = join(HERE, 'debug.keystore');

const VERSION_NAME = '1.9.0';
const VERSION_CODE = 15;
const MIN_SDK = 26;
const TARGET_SDK = 34;

const args = process.argv.slice(2);
const INSTALL = args.includes('--install');
const KEEP = args.includes('--debug');
const DEBUG_WEBVIEW = args.includes('--debug-webview');

const C = {
  g: s => `\x1b[32m${s}\x1b[0m`,
  y: s => `\x1b[33m${s}\x1b[0m`,
  r: s => `\x1b[31m${s}\x1b[0m`,
  d: s => `\x1b[90m${s}\x1b[0m`,
};

function die(msg) {
  console.error(C.r('\n✗ ' + msg));
  process.exit(1);
}

/* ---------------- 环境探测 ---------------- */
const SDK = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
if (!SDK || !existsSync(SDK)) die('没找到 Android SDK：请设置 ANDROID_HOME');

const BUILD_TOOLS = (() => {
  const dir = join(SDK, 'build-tools');
  if (!existsSync(dir)) die('缺少 build-tools');
  const vers = readdirSync(dir).filter(v => /^\d+\./.test(v))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const v of vers) {
    if (existsSync(join(dir, v, 'aapt2.exe')) || existsSync(join(dir, v, 'aapt2'))) return join(dir, v);
  }
  die('build-tools 里没有 aapt2');
})();

const ANDROID_JAR = (() => {
  const p = join(SDK, 'platforms', `android-${TARGET_SDK}`, 'android.jar');
  if (existsSync(p)) return p;
  const dir = join(SDK, 'platforms');
  const vers = existsSync(dir) ? readdirSync(dir).filter(v => /^android-\d+$/.test(v)) : [];
  if (!vers.length) die(`缺少 platforms/android-${TARGET_SDK}/android.jar`);
  return join(dir, vers[vers.length - 1], 'android.jar');
})();

const JDK = (() => {
  const home = process.env.JAVA_HOME;
  if (home && existsSync(join(home, 'bin', 'javac.exe'))) return home;
  if (home && existsSync(join(home, 'bin', 'javac'))) return home;
  die('没找到 JDK：请设置 JAVA_HOME（需要 javac，Android Studio 自带的 jbr 即可）');
})();

const exe = n => {
  const base = join(BUILD_TOOLS, n);
  const win = base + '.exe';
  if (existsSync(win)) return win;
  if (existsSync(base)) return base;
  die(`缺少 ${n}（${BUILD_TOOLS}）`);
};
const javaBin = join(JDK, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
const javacBin = join(JDK, 'bin', process.platform === 'win32' ? 'javac.exe' : 'javac');
const jarBin = join(JDK, 'bin', process.platform === 'win32' ? 'jar.exe' : 'jar');
const keytoolBin = join(JDK, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool');

function run(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { stdio: opts.quiet ? 'pipe' : 'inherit', cwd: opts.cwd || HERE, encoding: 'utf8' });
  if (r.status !== 0) {
    if (opts.quiet && r.stderr) console.error(C.d(r.stderr.trim().split('\n').slice(0, 12).join('\n')));
    die(`${cmd.split(/[\\/]/).pop()} 执行失败（exit ${r.status}）`);
  }
  return r;
}

function walk(dir, ext, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (extname(p) === ext) out.push(p);
  }
  return out;
}

/* ---------------- 开跑 ---------------- */
console.log(C.d(`SDK        ${SDK}`));
console.log(C.d(`build-tools ${BUILD_TOOLS.split(/[\\/]/).pop()}`));
console.log(C.d(`JDK        ${JDK}`));
console.log(C.d(`android.jar ${ANDROID_JAR}\n`));

console.log('› 1/8 构建网页产物 index.html');
const webArgs = args.includes('--with-atlantic') ? ['--with-atlantic'] : [];
run(process.execPath, [join(ROOT, 'build.mjs'), ...webArgs], { quiet: true });

console.log('› 2/8 准备 assets');
rmSync(ASSETS, { recursive: true, force: true });
mkdirSync(ASSETS, { recursive: true });
cpSync(join(ROOT, 'index.html'), join(ASSETS, 'index.html'));
const kb = Math.round(statSync(join(ASSETS, 'index.html')).size / 1024);
console.log(C.d(`     index.html ${kb} KB`));

rmSync(BUILD, { recursive: true, force: true });
mkdirSync(GEN, { recursive: true });
mkdirSync(CLASSES, { recursive: true });
mkdirSync(DEX, { recursive: true });
mkdirSync(DIST, { recursive: true });

console.log('› 3/8 aapt2 编译资源');
run(exe('aapt2'), ['compile', '--dir', join(HERE, 'res'), '-o', join(BUILD, 'res.zip')], { quiet: true });

console.log('› 4/8 aapt2 链接');
run(exe('aapt2'), [
  'link',
  '-o', join(BUILD, 'base.apk'),
  '-I', ANDROID_JAR,
  '--manifest', join(HERE, 'AndroidManifest.xml'),
  '-A', ASSETS,
  '--java', GEN,
  '--min-sdk-version', String(MIN_SDK),
  '--target-sdk-version', String(TARGET_SDK),
  '--version-code', String(VERSION_CODE),
  '--version-name', VERSION_NAME,
  '--auto-add-overlay',
  ...(DEBUG_WEBVIEW ? ['--debug-mode'] : []),
  join(BUILD, 'res.zip'),
], { quiet: true });

console.log('› 5/8 编译 Java');
const javaFiles = [...walk(GEN, '.java'), ...walk(join(HERE, 'src'), '.java')];
run(javacBin, [
  '-source', '8', '-target', '8', '-nowarn', '-encoding', 'UTF-8',
  '-classpath', ANDROID_JAR,
  '-d', CLASSES,
  ...javaFiles,
], { quiet: true });
console.log(C.d(`     ${javaFiles.length} 个源文件`));

console.log('› 6/8 d8 生成 classes.dex');
run(jarBin, ['cf', join(BUILD, 'classes.jar'), '-C', CLASSES, '.'], { quiet: true });
run(javaBin, [
  '-cp', join(BUILD_TOOLS, 'lib', 'd8.jar'),
  'com.android.tools.r8.D8',
  '--release', '--min-api', String(MIN_SDK),
  '--lib', ANDROID_JAR,
  '--output', DEX,
  join(BUILD, 'classes.jar'),
], { quiet: true });
run(jarBin, ['uf', join(BUILD, 'base.apk'), '-C', DEX, 'classes.dex'], { quiet: true });

console.log('› 7/8 zipalign 对齐');
run(exe('zipalign'), ['-f', '-p', '4', join(BUILD, 'base.apk'), join(BUILD, 'aligned.apk')], { quiet: true });

console.log('› 8/8 签名');
if (!existsSync(KEYSTORE)) {
  console.log(C.d('     首次运行，生成 debug.keystore'));
  run(keytoolBin, [
    '-genkeypair', '-keystore', KEYSTORE, '-alias', 'androiddebugkey',
    '-storepass', 'android', '-keypass', 'android',
    '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
    '-dname', 'CN=Android Debug,O=Android,C=US',
  ], { quiet: true });
}
const apkName = `press-reader-${VERSION_NAME}.apk`;
const APK = join(DIST, apkName);
run(javaBin, [
  '-jar', join(BUILD_TOOLS, 'lib', 'apksigner.jar'), 'sign',
  '--ks', KEYSTORE, '--ks-key-alias', 'androiddebugkey',
  '--ks-pass', 'pass:android', '--key-pass', 'pass:android',
  '--out', APK, join(BUILD, 'aligned.apk'),
], { quiet: true });
run(javaBin, ['-jar', join(BUILD_TOOLS, 'lib', 'apksigner.jar'), 'verify', APK], { quiet: true });

const size = (statSync(APK).size / 1024 / 1024).toFixed(2);
console.log('\n' + C.g('✓ 打包完成'));
console.log(`  ${APK}`);
console.log(`  ${size} MB · minSdk ${MIN_SDK} · targetSdk ${TARGET_SDK} · versionName ${VERSION_NAME}`);

if (!KEEP) rmSync(BUILD, { recursive: true, force: true });

if (INSTALL) {
  const adb = join(SDK, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  if (!existsSync(adb)) die('缺少 platform-tools/adb，无法安装');
  console.log('\n› 安装到设备');
  run(adb, ['install', '-r', APK]);
  run(adb, ['shell', 'am', 'start', '-n', 'com.pressreader.app/.MainActivity'], { quiet: true });
  console.log(C.g('✓ 已安装并启动'));
}

// 写入构建信息，方便排查版本
writeFileSync(join(DIST, 'build-info.json'), JSON.stringify({
  name: 'press-reader', versionName: VERSION_NAME, versionCode: VERSION_CODE,
  minSdk: MIN_SDK, targetSdk: TARGET_SDK, apk: apkName,
  builtAt: new Date().toISOString(), web: kb + ' KB',
}, null, 2));
