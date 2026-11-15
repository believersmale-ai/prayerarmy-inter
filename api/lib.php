<?php
// Shared helpers for the Prayer Army API. Not a public entry point.
if (!defined('PAI_API')) { http_response_code(403); exit; }

require __DIR__ . '/config.php';
mb_internal_encoding('UTF-8');
date_default_timezone_set('UTC');

const ROLES = ['owner', 'editor', 'media', 'care'];
const ROLE_PERMS = [
    'owner'  => ['settings', 'media', 'messages', 'care', 'analytics', 'team', 'security'],
    'editor' => ['settings', 'media', 'messages', 'analytics'],
    'media'  => ['media', 'messages'],
    'care'   => ['care'],
];

/* ---------- output ---------- */
function out($data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');
    header('Referrer-Policy: same-origin');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}
function fail(string $msg, int $code = 400): void {
    out(['error' => $msg, 'message' => $msg, 'msg' => $msg], $code);
}

/* ---------- database ---------- */
function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $dsn = 'mysql:host=' . DB_HOST . (defined('DB_PORT') ? ';port=' . DB_PORT : '') . ';dbname=' . DB_NAME . ';charset=utf8mb4';
            $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
            $pdo->exec("SET time_zone = '+00:00'");
            migrate($pdo);
        } catch (Throwable $e) {
            error_log('PAI db connect: ' . $e->getMessage());
            fail('The database is not reachable. Check api/config.php.', 500);
        }
    }
    return $pdo;
}
function q(string $sql, array $args = []): PDOStatement {
    $s = db()->prepare($sql);
    $s->execute($args);
    return $s;
}
function now(): string { return gmdate('Y-m-d H:i:s'); }
function uuid(): string {
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    $h = bin2hex($b);
    return sprintf('%s-%s-%s-%s-%s', substr($h, 0, 8), substr($h, 8, 4), substr($h, 12, 4), substr($h, 16, 4), substr($h, 20));
}

/* ---------- safe, additive schema upgrades ----------
   Runs once per schema version (a single tiny query on every other request).
   It only ever CREATEs missing tables and ADDs missing columns: it never drops,
   renames or rewrites existing data. */
const SCHEMA_VERSION = 3;
function migrate(PDO $pdo): void {
    $pdo->exec('CREATE TABLE IF NOT EXISTS schema_meta (k VARCHAR(30) PRIMARY KEY, v INT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $cur = (int)$pdo->query("SELECT v FROM schema_meta WHERE k = 'version'")->fetchColumn();
    if ($cur >= SCHEMA_VERSION) return;

    // 1) any missing tables (schema.sql only uses CREATE TABLE IF NOT EXISTS)
    foreach (array_filter(array_map('trim', explode(';', (string)file_get_contents(__DIR__ . '/schema.sql')))) as $stmt) {
        if (preg_match('/^(--[^\n]*\n)*\s*$/', $stmt)) continue;
        $pdo->exec($stmt);
    }
    // 2) any missing columns on tables that existed before this version
    $add = [
        ['messages', 'speaker', 'VARCHAR(120) NULL'],
        ['messages', 'category', 'VARCHAR(60) NULL'],
        ['messages', 'thumbnail_url', 'VARCHAR(2000) NULL'],
        ['messages', 'is_featured', 'TINYINT(1) NOT NULL DEFAULT 0'],
        ['prayer_requests', 'follow_up', "VARCHAR(12) NOT NULL DEFAULT 'new'"],
        ['prayer_requests', 'admin_note', 'VARCHAR(1000) NULL'],
        ['testimonies', 'show_name', 'TINYINT(1) NOT NULL DEFAULT 1'],
        ['admin_config', 'notify_json', 'TEXT NULL'],
    ];
    foreach ($add as [$t, $c, $def]) {
        $has = $pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
        $has->execute([$t, $c]);
        if ((int)$has->fetchColumn() === 0) {
            try { $pdo->exec("ALTER TABLE `$t` ADD COLUMN `$c` $def"); }
            catch (Throwable $e) { if (!str_contains($e->getMessage(), '1060')) throw $e; } // 1060 = another request added it first
        }
    }
    $pdo->prepare("INSERT INTO schema_meta (k, v) VALUES ('version', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)")->execute([SCHEMA_VERSION]);
}

/* ---------- spam protection: signed, time-limited form tokens ----------
   A form fetches a token when it is shown. The server accepts a submission only if the token is
   genuine and between 2 seconds and 4 hours old, which blocks simple bots that post straight to the API. */
function form_token(): string {
    $ts = (string)time();
    return $ts . '.' . substr(hash_hmac('sha256', "form|$ts", secret()), 0, 32);
}
function form_token_ok($t): bool {
    if (!is_string($t) || !preg_match('/^(\d{9,11})\.([a-f0-9]{32})$/', $t, $m)) return false;
    if (!hash_equals(substr(hash_hmac('sha256', "form|{$m[1]}", secret()), 0, 32), $m[2])) return false;
    $age = time() - (int)$m[1];
    return $age >= 2 && $age <= 4 * 3600;
}

/* ---------- site settings + admin notifications ---------- */
function site_settings(): array {
    static $cache = null;
    if ($cache === null) {
        $r = q('SELECT data FROM site_settings WHERE id = 1')->fetch();
        $cache = $r ? (json_decode($r['data'], true) ?: []) : [];
    }
    return $cache;
}
/** Notification preferences. Kept in admin_config (NOT in the public site settings) so the address is never published. */
function notify_prefs(): array {
    $r = q('SELECT notify_json FROM admin_config WHERE id = 1')->fetch();
    $j = $r && $r['notify_json'] ? json_decode($r['notify_json'], true) : null;
    return is_array($j) ? $j : [];
}
/** Optional e-mail alert to the address chosen under Settings > Notifications. Never includes private request text. */
function notify(string $event, string $subject, string $line): void {
    try {
        $n = notify_prefs();
        $to = trim((string)($n['email'] ?? ''));
        if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL) || empty($n[$event])) return;
        $host = preg_replace('/[^A-Za-z0-9.-]/', '', preg_replace('/^www\./', '', $_SERVER['HTTP_HOST'] ?? 'localhost'));
        $headers = "From: Prayer Army Website <noreply@$host>\r\nContent-Type: text/plain; charset=UTF-8\r\nX-Mailer: PAI";
        @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $line . "\n\nOpen the admin dashboard to view it: https://$host/admin\n", $headers);
    } catch (Throwable $e) { error_log('PAI notify: ' . $e->getMessage()); }
}

/* ---------- request helpers ---------- */
function body(): array {
    static $b = null;
    if ($b === null) {
        $j = json_decode((string)file_get_contents('php://input'), true);
        $b = is_array($j) ? $j : (!empty($_POST) ? $_POST : []);
    }
    return $b;
}
function clean($v, int $max): string {
    $v = is_scalar($v) ? trim((string)$v) : '';
    return mb_substr($v, 0, $max);
}
function need($v, int $max, string $label): string {
    $v = clean($v, $max);
    if ($v === '') fail("$label is required", 400);
    return $v;
}
function opt($v, int $max): ?string {
    $v = clean($v, $max);
    return $v === '' ? null : $v;
}
function secret(): string { return hash('sha256', DB_PASS . '|' . DB_NAME . '|' . SETUP_KEY); }
function ip_key(): string { return substr(hash_hmac('sha256', $_SERVER['REMOTE_ADDR'] ?? '0', secret()), 0, 32); }

/* ---------- rate limiting (per visitor, no raw IPs stored) ---------- */
function rate_count(string $bucket, int $window): int {
    $row = q('SELECT hits FROM rate_limits WHERE k = ? AND win = ?', [$bucket . ':' . ip_key(), intdiv(time(), $window)])->fetch();
    return $row ? (int)$row['hits'] : 0;
}
function rate_hit(string $bucket, int $window): int {
    $k = $bucket . ':' . ip_key();
    $w = intdiv(time(), $window);
    q('INSERT INTO rate_limits (k, win, hits, ts) VALUES (?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE hits = IF(win = VALUES(win), hits + 1, 1), win = VALUES(win), ts = VALUES(ts)', [$k, $w, time()]);
    if (random_int(1, 100) === 1) q('DELETE FROM rate_limits WHERE ts < ?', [time() - 86400]);
    return rate_count($bucket, $window);
}
function rate_guard(string $bucket, int $max, int $window = 3600): void {
    if (rate_hit($bucket, $window) > $max) out(['error' => 'rate_limited', 'message' => 'rate_limited'], 429);
}

/* ---------- accounts & sessions ---------- */
function issue_session(string $uid): array {
    $a = bin2hex(random_bytes(32));
    $r = bin2hex(random_bytes(32));
    q('INSERT INTO sessions (id, user_id, access_hash, access_expires, refresh_hash, refresh_expires) VALUES (?,?,?,?,?,?)',
      [uuid(), $uid, hash('sha256', $a), gmdate('Y-m-d H:i:s', time() + 3600), hash('sha256', $r), gmdate('Y-m-d H:i:s', time() + 30 * 86400)]);
    if (random_int(1, 50) === 1) q('DELETE FROM sessions WHERE refresh_expires < ?', [now()]);
    return ['access_token' => $a, 'refresh_token' => $r, 'expires_in' => 3600, 'token_type' => 'bearer'];
}
function credential(): string {
    $c = body()['passkey'] ?? '';
    if ($c === '' || !is_string($c)) {
        $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if (!$h && function_exists('getallheaders')) { foreach (getallheaders() as $k => $v) if (strtolower($k) === 'authorization') $h = $v; }
        if (preg_match('/^Bearer\s+(\S+)$/i', $h, $m)) $c = $m[1];
    }
    return is_string($c) ? $c : '';
}
function admin_config(): array {
    $r = q('SELECT legacy_enabled, passkey_hash FROM admin_config WHERE id = 1')->fetch();
    if (!$r) { q('INSERT IGNORE INTO admin_config (id, legacy_enabled) VALUES (1, 0)'); $r = ['legacy_enabled' => 0, 'passkey_hash' => null]; }
    return ['legacy_enabled' => (int)$r['legacy_enabled'] === 1, 'passkey_hash' => $r['passkey_hash']];
}
/** Who is calling? Returns null when not signed in. */
function current_user(?string $cred = null): ?array {
    $cred = $cred ?? credential();
    if ($cred === '') return null;
    if (preg_match('/^[a-f0-9]{64}$/', $cred)) {
        $u = q('SELECT u.id, u.email, u.display_name, u.role FROM sessions s JOIN admin_users u ON u.id = s.user_id
                WHERE s.access_hash = ? AND s.access_expires > ? AND u.active = 1', [hash('sha256', $cred), now()])->fetch();
        if ($u) return ['via' => 'account', 'user_id' => $u['id'], 'email' => $u['email'], 'name' => $u['display_name'],
                        'role' => $u['role'], 'permissions' => ROLE_PERMS[$u['role']] ?? []];
    }
    $cfg = admin_config();
    if ($cfg['legacy_enabled'] && $cfg['passkey_hash']) {
        if (rate_count('pkfail', 900) >= 10) out(['error' => 'Too many attempts. Please wait a few minutes.'], 429);
        if (password_verify($cred, $cfg['passkey_hash'])) {
            return ['via' => 'passkey', 'user_id' => null, 'email' => 'shared passkey', 'name' => 'Shared passkey',
                    'role' => 'owner', 'permissions' => ROLE_PERMS['owner']];
        }
        rate_hit('pkfail', 900);
    }
    return null;
}
function require_perm(string $perm): array {
    $u = current_user();
    if (!$u) fail('Not signed in or session expired', 401);
    if (!in_array($perm, $u['permissions'], true)) fail('Your role is not allowed to do this', 403);
    return $u;
}

/* ---------- row formatting ---------- */
function iso(?string $d): ?string { return $d ? str_replace(' ', 'T', $d) . '.000Z' : null; }
function fmt(array $r): array {
    foreach (['created_at', 'updated_at', 'last_sign_in_at'] as $c) if (array_key_exists($c, $r)) $r[$c] = iso($r[$c]);
    foreach (['is_private', 'is_read', 'is_contacted', 'is_approved', 'active', 'legacy_enabled', 'is_featured', 'show_name'] as $c) if (array_key_exists($c, $r)) $r[$c] = (bool)$r[$c];
    if (isset($r['prayed_count'])) $r['prayed_count'] = (int)$r['prayed_count'];
    return $r;
}
function fmt_all(array $rows): array { return array_map('fmt', $rows); }

/* ---------- files ---------- */
function uploads_dir(): string {
    $d = dirname(__DIR__) . '/uploads';
    if (!is_dir($d)) @mkdir($d, 0755, true);
    return $d;
}
const MEDIA_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'mov', 'm4v', 'ogv', 'ogg', 'oga', 'mp3', 'wav', 'm4a', 'aac', 'flac'];
function media_type_of(string $name): string {
    $e = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (in_array($e, ['mp4', 'webm', 'mov', 'm4v', 'ogv'], true)) return 'video';
    if (in_array($e, ['mp3', 'wav', 'm4a', 'aac', 'oga', 'flac', 'ogg'], true)) return 'audio';
    return 'image';
}
function safe_upload_name(string $raw): ?string {
    $n = basename(str_replace('\\', '/', rawurldecode($raw)));
    if ($n === '' || $n[0] === '.' || str_contains($n, '..')) return null;
    return preg_match('/^[A-Za-z0-9._-]+$/', $n) ? $n : null;
}
