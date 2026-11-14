<?php
// Prayer Army International - API entry point (replaces Supabase).
// The website keeps calling the same URL shapes it always used (rest/v1, functions/v1,
// auth/v1, storage/v1); this file answers them from MySQL and the uploads folder.
define('PAI_API', true);
require __DIR__ . '/lib.php';

$method = $_SERVER['REQUEST_METHOD'];
$path = trim((string)preg_replace('#^.*?/api/#', '', (string)parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), 1), '/');

try {
    if ($method === 'OPTIONS') { http_response_code(204); exit; }

    if ($path === 'rest/v1/rpc/increment_prayed' && $method === 'POST') rpc_increment_prayed();
    elseif (preg_match('#^rest/v1/([a-z_]+)$#', $path, $m)) {
        if ($method === 'GET') rest_get($m[1]);
        elseif ($method === 'POST') rest_post($m[1]);
        else fail('Method not allowed', 405);
    }
    elseif (preg_match('#^auth/v1/(token|logout|user)$#', $path, $m)) auth_route($m[1], $method);
    elseif ($path === 'storage/v1/object/list/media') storage_list();
    elseif ($path === 'podcast-feed' || $path === 'podcast.xml' || $path === 'functions/v1/podcast-feed') podcast_feed();
    elseif (preg_match('#^functions/v1/([a-z-]+)$#', $path, $m)) {
        if ($method !== 'POST') fail('Method not allowed', 405);
        switch ($m[1]) {
            case 'verify-passkey':  fn_verify_passkey(); break;
            case 'admin-users':     fn_admin_users(); break;
            case 'manage-content':  fn_manage_content(); break;
            case 'save-settings':   fn_save_settings(); break;
            case 'change-passkey':  fn_change_passkey(); break;
            case 'upload-media':    fn_upload_media(); break;
            case 'delete-media':    fn_delete_media(); break;
            default: fail('Not found', 404);
        }
    }
    else fail('Not found', 404);
} catch (Throwable $e) {
    error_log('PAI api error: ' . $e->getMessage());
    fail('Something went wrong on the server. Please try again.', 500);
}

/* =====================================================================
   PUBLIC DATA  (rest/v1)
   ===================================================================== */
function qs_limit(int $default, int $max): int {
    $l = isset($_GET['limit']) ? (int)$_GET['limit'] : $default;
    return max(1, min($max, $l));
}
function qs_dir(): string {
    return (isset($_GET['order']) && str_ends_with((string)$_GET['order'], '.asc')) ? 'ASC' : 'DESC';
}

function rest_get(string $table): void {
    $dir = qs_dir();
    switch ($table) {
        case 'site_settings':
            $r = q('SELECT data FROM site_settings WHERE id = 1')->fetch();
            out($r ? [['data' => json_decode($r['data'], true) ?: new stdClass()]] : []);
        case 'messages':
            out(fmt_all(q("SELECT id, title, description, link, media_url, media_type, notes_url, source, created_at
                           FROM messages ORDER BY created_at $dir LIMIT " . qs_limit(200, 500))->fetchAll()));
        case 'message_comments':
            out(fmt_all(q("SELECT id, message_id, name, comment, created_at FROM message_comments
                           ORDER BY created_at $dir LIMIT 5000")->fetchAll()));
        case 'testimonies':
            out(fmt_all(q("SELECT id, name, location, testimony, created_at FROM testimonies
                           WHERE is_approved = 1 ORDER BY created_at $dir LIMIT " . qs_limit(12, 50))->fetchAll()));
        case 'wall_prayers':
            out(fmt_all(q("SELECT id, name, request, prayed_count FROM wall_prayers
                           WHERE is_approved = 1 ORDER BY created_at $dir LIMIT " . qs_limit(24, 100))->fetchAll()));
    }
    fail('Not found', 404);
}

function respond_created(string $table, string $id): void {
    $wantRow = str_contains((string)($_SERVER['HTTP_PREFER'] ?? ''), 'return=representation');
    if (!$wantRow) { http_response_code(201); exit; }
    $cols = ['message_comments' => 'id, message_id, name, comment, created_at'][$table] ?? '*';
    out(fmt_all(q("SELECT $cols FROM $table WHERE id = ?", [$id])->fetchAll()), 201);
}

function rest_post(string $table): void {
    $b = body();
    $id = uuid();
    switch ($table) {
        case 'site_events':
            rate_guard('ev', 400);
            $kind = clean($b['kind'] ?? '', 30);
            if (!preg_match('/^[a-z_]{1,30}$/', $kind)) fail('Bad event', 400);
            $device = in_array($b['device'] ?? '', ['mobile', 'tablet', 'desktop'], true) ? $b['device'] : null;
            q('INSERT INTO site_events (kind, label, path, referrer, device, created_at) VALUES (?,?,?,?,?,?)',
              [$kind, opt($b['label'] ?? '', 200), opt($b['path'] ?? '', 200), opt($b['referrer'] ?? '', 200), $device, now()]);
            http_response_code(201); exit;

        case 'prayer_requests':
            rate_guard('prayer', 20);
            q('INSERT INTO prayer_requests (id, name, contact, request, is_private, created_at) VALUES (?,?,?,?,?,?)',
              [$id, need($b['name'] ?? '', 120, 'Name'), opt($b['contact'] ?? '', 200), need($b['request'] ?? '', 4000, 'Request'),
               !empty($b['is_private']) ? 1 : 0, now()]);
            break;

        case 'message_comments':
            rate_guard('comment', 20);
            $mid = clean($b['message_id'] ?? '', 36);
            if (!q('SELECT 1 FROM messages WHERE id = ?', [$mid])->fetch()) fail('Message not found', 400);
            q('INSERT INTO message_comments (id, message_id, name, comment, created_at) VALUES (?,?,?,?,?)',
              [$id, $mid, need($b['name'] ?? '', 80, 'Name'), need($b['comment'] ?? '', 1000, 'Comment'), now()]);
            break;

        case 'testimonies':
            rate_guard('testimony', 10);
            q('INSERT INTO testimonies (id, name, location, testimony, created_at) VALUES (?,?,?,?,?)',
              [$id, need($b['name'] ?? '', 80, 'Name'), opt($b['location'] ?? '', 80), need($b['testimony'] ?? '', 1500, 'Testimony'), now()]);
            break;

        case 'connect_requests':
            rate_guard('connect', 20);
            $phone = opt($b['phone'] ?? '', 40); $email = opt($b['email'] ?? '', 160);
            if (!$phone && !$email) fail('Phone or email required', 400);
            if ($email && !filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Email looks wrong', 400);
            $kind = in_array($b['kind'] ?? '', ['visitor', 'volunteer', 'counseling', 'other'], true) ? $b['kind'] : 'visitor';
            q('INSERT INTO connect_requests (id, name, phone, email, kind, note, created_at) VALUES (?,?,?,?,?,?,?)',
              [$id, need($b['name'] ?? '', 120, 'Name'), $phone, $email, $kind, opt($b['note'] ?? '', 2000), now()]);
            break;

        case 'wall_prayers':
            rate_guard('wall', 20);
            q('INSERT INTO wall_prayers (id, name, request, created_at) VALUES (?,?,?,?)',
              [$id, opt($b['name'] ?? '', 60), need($b['request'] ?? '', 400, 'Request'), now()]);
            break;

        default:
            fail('Not found', 404);
    }
    respond_created($table, $id);
}

function rpc_increment_prayed(): void {
    rate_guard('pray', 120);
    $id = clean(body()['p_id'] ?? '', 36);
    q('UPDATE wall_prayers SET prayed_count = prayed_count + 1 WHERE id = ? AND is_approved = 1', [$id]);
    out(null);
}

/* =====================================================================
   SIGN-IN  (auth/v1)
   ===================================================================== */
function auth_route(string $what, string $method): void {
    if ($what === 'token' && $method === 'POST') {
        $grant = $_GET['grant_type'] ?? 'password';
        $b = body();
        if ($grant === 'password') {
            $email = strtolower(clean($b['email'] ?? '', 190));
            $pass = is_string($b['password'] ?? null) ? $b['password'] : '';
            if (rate_count('login', 900) >= 10) out(['error' => 'Too many attempts', 'msg' => 'Too many attempts'], 429);
            $u = q('SELECT id, password_hash, active FROM admin_users WHERE email = ?', [$email])->fetch();
            // always run a hash check so response time does not reveal whether the email exists
            $hash = $u['password_hash'] ?? '$2y$10$bycepDUpRlkd8q.8MUIZ/eOhnqOSD2C6TTC8HybScVeNOCX/jCu1e';
            $ok = password_verify($pass, $hash) && $u && (int)$u['active'] === 1;
            if (!$ok) { rate_hit('login', 900); out(['error' => 'invalid_grant', 'msg' => 'Invalid login credentials'], 400); }
            q('UPDATE admin_users SET last_sign_in_at = ? WHERE id = ?', [now(), $u['id']]);
            if (password_needs_rehash($hash, PASSWORD_DEFAULT)) q('UPDATE admin_users SET password_hash = ? WHERE id = ?', [password_hash($pass, PASSWORD_DEFAULT), $u['id']]);
            out(issue_session($u['id']));
        }
        if ($grant === 'refresh_token') {
            $rt = is_string($b['refresh_token'] ?? null) ? $b['refresh_token'] : '';
            $s = q('SELECT s.id, s.user_id FROM sessions s JOIN admin_users u ON u.id = s.user_id
                    WHERE s.refresh_hash = ? AND s.refresh_expires > ? AND u.active = 1', [hash('sha256', $rt), now()])->fetch();
            if (!$s) out(['error' => 'invalid_grant', 'msg' => 'Invalid refresh token'], 400);
            q('DELETE FROM sessions WHERE id = ?', [$s['id']]);
            out(issue_session($s['user_id']));
        }
        fail('Unsupported grant type', 400);
    }
    if ($what === 'logout' && $method === 'POST') {
        $c = credential();
        if ($c !== '') q('DELETE FROM sessions WHERE access_hash = ?', [hash('sha256', $c)]);
        http_response_code(204); exit;
    }
    if ($what === 'user' && $method === 'PUT') {
        $u = current_user();
        if (!$u || $u['via'] !== 'account') fail('Not signed in', 401);
        $pw = body()['password'] ?? '';
        if (!is_string($pw) || mb_strlen($pw) < 10) fail('Use at least 10 characters', 422);
        q('UPDATE admin_users SET password_hash = ? WHERE id = ?', [password_hash($pw, PASSWORD_DEFAULT), $u['user_id']]);
        out(['id' => $u['user_id'], 'email' => $u['email']]);
    }
    fail('Not found', 404);
}

function fn_verify_passkey(): void {
    $cfg = admin_config();
    if (!$cfg['legacy_enabled'] || !$cfg['passkey_hash']) fail('The shared passkey has been turned off. Sign in with your own account.', 401);
    if (rate_count('pkfail', 900) >= 10) out(['error' => 'Too many attempts. Please wait a few minutes.'], 429);
    $p = body()['passkey'] ?? '';
    if (is_string($p) && $p !== '' && password_verify($p, $cfg['passkey_hash'])) out(['success' => true]);
    rate_hit('pkfail', 900);
    fail('Incorrect passkey', 401);
}

function fn_change_passkey(): void {
    $u = current_user(is_string(body()['currentPasskey'] ?? null) ? body()['currentPasskey'] : '');
    if (!$u) fail('Not signed in or session expired', 401);
    if (!in_array('security', $u['permissions'], true)) fail('Only a System admin can change the passkey', 403);
    $n = body()['newPasskey'] ?? '';
    if (!is_string($n) || mb_strlen(trim($n)) < 8) fail('The passkey must be at least 8 characters', 400);
    q('INSERT INTO admin_config (id, legacy_enabled, passkey_hash) VALUES (1, 0, ?) ON DUPLICATE KEY UPDATE passkey_hash = VALUES(passkey_hash)',
      [password_hash(trim($n), PASSWORD_DEFAULT)]);
    out(['success' => true]);
}

/* =====================================================================
   TEAM  (admin-users)
   ===================================================================== */
function active_owner_count(?string $except = null): int {
    $sql = "SELECT COUNT(*) c FROM admin_users WHERE role = 'owner' AND active = 1" . ($except ? ' AND id <> ?' : '');
    return (int)q($sql, $except ? [$except] : [])->fetch()['c'];
}
function fn_admin_users(): void {
    $b = body();
    $action = (string)($b['action'] ?? '');
    $p = is_array($b['payload'] ?? null) ? $b['payload'] : [];

    if ($action === 'whoami') {
        $u = current_user();
        if (!$u) fail('Not signed in or session expired', 401);
        out(['me' => $u, 'legacy_enabled' => admin_config()['legacy_enabled']]);
    }
    $me = require_perm('team');
    $uid = clean($p['user_id'] ?? '', 36);

    switch ($action) {
        case 'list_users':
            out(['users' => array_map(fn($r) => fmt($r) + [], q('SELECT id AS user_id, email, display_name, role, active, last_sign_in_at
                                                          FROM admin_users ORDER BY created_at')->fetchAll())]);
        case 'create_user':
            $email = strtolower(clean($p['email'] ?? '', 190));
            $role = (string)($p['role'] ?? '');
            $pw = is_string($p['password'] ?? null) ? $p['password'] : '';
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Enter a valid email address', 400);
            if (!in_array($role, ROLES, true)) fail('Choose a role', 400);
            if (mb_strlen($pw) < 10) fail('The password must be at least 10 characters', 400);
            if (q('SELECT 1 FROM admin_users WHERE email = ?', [$email])->fetch()) fail('An account with that email already exists', 409);
            q('INSERT INTO admin_users (id, email, display_name, password_hash, role, active, created_at) VALUES (?,?,?,?,?,1,?)',
              [uuid(), $email, clean($p['name'] ?? '', 80) ?: $email, password_hash($pw, PASSWORD_DEFAULT), $role, now()]);
            out(['ok' => true]);
        case 'set_role':
            $role = (string)($p['role'] ?? '');
            if (!in_array($role, ROLES, true)) fail('Choose a role', 400);
            $t = q('SELECT role FROM admin_users WHERE id = ?', [$uid])->fetch();
            if (!$t) fail('Account not found', 404);
            if ($t['role'] === 'owner' && $role !== 'owner' && active_owner_count($uid) === 0) fail('There must always be at least one active System admin', 400);
            q('UPDATE admin_users SET role = ? WHERE id = ?', [$role, $uid]);
            out(['ok' => true]);
        case 'set_active':
            $on = !empty($p['active']);
            $t = q('SELECT role FROM admin_users WHERE id = ?', [$uid])->fetch();
            if (!$t) fail('Account not found', 404);
            if (!$on && $uid === $me['user_id']) fail('You cannot turn off your own account', 400);
            if (!$on && $t['role'] === 'owner' && active_owner_count($uid) === 0) fail('There must always be at least one active System admin', 400);
            q('UPDATE admin_users SET active = ? WHERE id = ?', [$on ? 1 : 0, $uid]);
            if (!$on) q('DELETE FROM sessions WHERE user_id = ?', [$uid]);
            out(['ok' => true]);
        case 'reset_password':
            $pw = is_string($p['password'] ?? null) ? $p['password'] : '';
            if (mb_strlen($pw) < 10) fail('The password must be at least 10 characters', 400);
            if (!q('SELECT 1 FROM admin_users WHERE id = ?', [$uid])->fetch()) fail('Account not found', 404);
            q('UPDATE admin_users SET password_hash = ? WHERE id = ?', [password_hash($pw, PASSWORD_DEFAULT), $uid]);
            q('DELETE FROM sessions WHERE user_id = ?', [$uid]);
            out(['ok' => true]);
        case 'delete_user':
            $t = q('SELECT role FROM admin_users WHERE id = ?', [$uid])->fetch();
            if (!$t) fail('Account not found', 404);
            if ($uid === $me['user_id']) fail('You cannot delete your own account', 400);
            if ($t['role'] === 'owner' && active_owner_count($uid) === 0) fail('There must always be at least one active System admin', 400);
            q('DELETE FROM admin_users WHERE id = ?', [$uid]);
            out(['ok' => true]);
        case 'set_legacy':
            $on = !empty($p['enabled']);
            if ($on && !admin_config()['passkey_hash']) fail('Set a passkey first (Security tab, "New Passkey"), then turn it on', 400);
            q('INSERT INTO admin_config (id, legacy_enabled) VALUES (1, ?) ON DUPLICATE KEY UPDATE legacy_enabled = VALUES(legacy_enabled)', [$on ? 1 : 0]);
            out(['ok' => true]);
    }
    fail("Unknown action: $action", 400);
}

/* =====================================================================
   CONTENT  (manage-content)
   ===================================================================== */
function toggle(string $table, string $col, array $p, string $key): void {
    $id = clean($p['id'] ?? '', 36);
    if ($id === '') fail('id is required', 400);
    q("UPDATE $table SET $col = ? WHERE id = ?", [(($p[$key] ?? true) !== false) ? 1 : 0, $id]);
    out(['ok' => true]);
}
function remove(string $table, array $p): void {
    $id = clean($p['id'] ?? '', 36);
    if ($id === '') fail('id is required', 400);
    q("DELETE FROM $table WHERE id = ?", [$id]);
    out(['deleted' => $id]);
}
function fn_manage_content(): void {
    $b = body();
    $action = (string)($b['action'] ?? '');
    $p = is_array($b['payload'] ?? null) ? $b['payload'] : [];

    if ($action === 'list_hidden_assets') { // not secret: only hides bundled photos from the library
        out(['filenames' => array_column(q('SELECT filename FROM hidden_assets')->fetchAll(), 'filename')]);
    }

    $perm = match (true) {
        in_array($action, ['create_message', 'update_message', 'delete_message', 'delete_comment'], true) => 'messages',
        in_array($action, ['hide_asset', 'unhide_asset'], true) => 'media',
        $action === 'get_analytics' => 'analytics',
        in_array($action, ['list_prayer_requests', 'mark_prayer_request_read', 'delete_prayer_request', 'list_connect_requests',
            'mark_connect_contacted', 'delete_connect_request', 'list_testimonies', 'set_testimony_approved', 'delete_testimony',
            'list_wall_prayers', 'set_wall_approved', 'delete_wall_prayer'], true) => 'care',
        default => null,
    };
    if ($perm === null) fail("Unknown action: $action", 400);
    require_perm($perm);

    switch ($action) {
        case 'create_message':
            $mt = in_array($p['media_type'] ?? '', ['audio', 'video'], true) ? $p['media_type'] : null;
            $id = uuid();
            q('INSERT INTO messages (id, title, description, link, media_url, media_type, notes_url, source, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
              [$id, need($p['title'] ?? '', 200, 'title'), opt($p['description'] ?? '', 4000), opt($p['link'] ?? '', 2000),
               opt($p['media_url'] ?? '', 2000), $mt, opt($p['notes_url'] ?? '', 2000), ($p['source'] ?? '') === 'live' ? 'live' : 'manual', now()]);
            out(['message' => fmt(q('SELECT * FROM messages WHERE id = ?', [$id])->fetch())]);
        case 'update_message':
            $id = clean($p['id'] ?? '', 36);
            $sets = []; $args = [];
            foreach (['title' => 200, 'description' => 4000, 'link' => 2000, 'media_url' => 2000, 'notes_url' => 2000] as $col => $max) {
                if (array_key_exists($col, $p)) {
                    $v = opt($p[$col], $max);
                    if ($col === 'title' && $v === null) fail('title is required', 400);
                    $sets[] = "$col = ?"; $args[] = $v;
                }
            }
            if (array_key_exists('media_type', $p)) { $sets[] = 'media_type = ?'; $args[] = in_array($p['media_type'], ['audio', 'video'], true) ? $p['media_type'] : null; }
            if ($id === '' || !$sets) fail('Nothing to update', 400);
            $args[] = $id;
            q('UPDATE messages SET ' . implode(', ', $sets) . ' WHERE id = ?', $args);
            out(['ok' => true]);
        case 'delete_message': remove('messages', $p);
        case 'delete_comment': remove('message_comments', $p);

        case 'list_prayer_requests':
            out(['requests' => fmt_all(q('SELECT * FROM prayer_requests ORDER BY created_at DESC LIMIT 500')->fetchAll())]);
        case 'mark_prayer_request_read': toggle('prayer_requests', 'is_read', $p, 'is_read');
        case 'delete_prayer_request': remove('prayer_requests', $p);

        case 'list_connect_requests':
            out(['requests' => fmt_all(q('SELECT * FROM connect_requests ORDER BY created_at DESC LIMIT 500')->fetchAll())]);
        case 'mark_connect_contacted': toggle('connect_requests', 'is_contacted', $p, 'is_contacted');
        case 'delete_connect_request': remove('connect_requests', $p);

        case 'list_testimonies':
            out(['testimonies' => fmt_all(q('SELECT * FROM testimonies ORDER BY created_at DESC LIMIT 500')->fetchAll())]);
        case 'set_testimony_approved': toggle('testimonies', 'is_approved', $p, 'is_approved');
        case 'delete_testimony': remove('testimonies', $p);

        case 'list_wall_prayers':
            out(['prayers' => fmt_all(q('SELECT * FROM wall_prayers ORDER BY created_at DESC LIMIT 500')->fetchAll())]);
        case 'set_wall_approved': toggle('wall_prayers', 'is_approved', $p, 'is_approved');
        case 'delete_wall_prayer': remove('wall_prayers', $p);

        case 'hide_asset':
        case 'unhide_asset':
            $f = safe_upload_name((string)($p['filename'] ?? ''));
            if (!$f) fail('Bad filename', 400);
            if ($action === 'hide_asset') q('INSERT IGNORE INTO hidden_assets (filename) VALUES (?)', [$f]);
            else q('DELETE FROM hidden_assets WHERE filename = ?', [$f]);
            out(['ok' => true]);

        case 'get_analytics':
            q('DELETE FROM site_events WHERE created_at < ?', [gmdate('Y-m-d H:i:s', time() - 400 * 86400)]);
            $since = gmdate('Y-m-d 00:00:00', time() - 29 * 86400);
            $byDay = [];
            foreach (q("SELECT DATE(created_at) d, SUM(kind = 'view') v, SUM(kind = 'sermon_play') p FROM site_events
                        WHERE created_at >= ? GROUP BY d", [$since])->fetchAll() as $r) $byDay[$r['d']] = [(int)$r['v'], (int)$r['p']];
            $days = [];
            for ($i = 29; $i >= 0; $i--) {
                $d = gmdate('Y-m-d', time() - $i * 86400);
                $days[] = ['day' => $d, 'views' => $byDay[$d][0] ?? 0, 'plays' => $byDay[$d][1] ?? 0];
            }
            $rank = fn(string $sql) => array_map(fn($r) => [$r['n'], (int)$r['c']], q($sql, [$since])->fetchAll());
            $devices = [];
            foreach (q("SELECT device n, COUNT(*) c FROM site_events WHERE kind = 'view' AND device IS NOT NULL AND created_at >= ? GROUP BY device", [$since])->fetchAll() as $r) $devices[$r['n']] = (int)$r['c'];
            out(['analytics' => [
                'days' => $days,
                'shares' => (int)q("SELECT COUNT(*) c FROM site_events WHERE kind = 'share' AND created_at >= ?", [$since])->fetch()['c'],
                'topSermons' => $rank("SELECT label n, COUNT(*) c FROM site_events WHERE kind = 'sermon_play' AND label IS NOT NULL AND created_at >= ? GROUP BY label ORDER BY c DESC LIMIT 8"),
                'referrers' => $rank("SELECT referrer n, COUNT(*) c FROM site_events WHERE kind = 'view' AND referrer IS NOT NULL AND created_at >= ? GROUP BY referrer ORDER BY c DESC LIMIT 8"),
                'devices' => (object)$devices,
            ]]);
    }
    fail("Unknown action: $action", 400);
}

function fn_save_settings(): void {
    require_perm('settings');
    $s = body()['settings'] ?? null;
    if (!is_array($s)) fail('settings must be an object', 400);
    $json = json_encode($s, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false || strlen($json) > 2 * 1024 * 1024) fail('Settings are too large', 413);
    q('INSERT INTO site_settings (id, data, updated_at) VALUES (1, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = VALUES(updated_at)', [$json, now()]);
    out(['success' => true]);
}

/* =====================================================================
   MEDIA  (uploads folder)
   ===================================================================== */
function storage_list(): void {
    $dir = uploads_dir();
    $rows = [];
    foreach (scandir($dir) ?: [] as $f) {
        if ($f[0] === '.' || !is_file("$dir/$f")) continue;
        if (!in_array(strtolower(pathinfo($f, PATHINFO_EXTENSION)), MEDIA_EXT, true)) continue;
        $rows[] = ['name' => $f, 'created_at' => gmdate('c', filemtime("$dir/$f")), 'mtime' => filemtime("$dir/$f"), 'metadata' => ['size' => filesize("$dir/$f")]];
    }
    usort($rows, fn($a, $b) => $b['mtime'] <=> $a['mtime']);
    out(array_map(function ($r) { unset($r['mtime']); return $r; }, $rows));
}

function fn_upload_media(): void {
    require_perm('media');
    $files = $_FILES['files'] ?? null;
    if (!$files) fail('No files were uploaded (the file may be larger than the server allows)', 400);
    $names = (array)$files['name']; $tmps = (array)$files['tmp_name']; $errs = (array)$files['error']; $sizes = (array)$files['size'];
    $max = (int)MAX_UPLOAD_MB * 1024 * 1024;
    $dir = uploads_dir();
    $fi = new finfo(FILEINFO_MIME_TYPE);
    $saved = [];
    foreach ($names as $i => $orig) {
        if ($errs[$i] !== UPLOAD_ERR_OK) fail($errs[$i] === UPLOAD_ERR_INI_SIZE || $errs[$i] === UPLOAD_ERR_FORM_SIZE ? 'A file is larger than the server allows' : 'Upload failed', 413);
        if ($sizes[$i] > $max) fail('A file is larger than ' . MAX_UPLOAD_MB . ' MB', 413);
        $ext = strtolower(pathinfo((string)$orig, PATHINFO_EXTENSION));
        if (!in_array($ext, MEDIA_EXT, true)) fail("File type .$ext is not allowed (pictures, video and audio only)", 415);
        $mime = (string)$fi->file($tmps[$i]);
        $major = explode('/', $mime)[0];
        if (!in_array($major, ['image', 'video', 'audio'], true) && $mime !== 'application/ogg') fail('That file does not look like a picture, video or audio file', 415);
        if (media_type_of($orig) === 'image' && @getimagesize($tmps[$i]) === false) fail('That picture is damaged or not a real image', 415);
        $base = preg_replace('/[^A-Za-z0-9._-]+/', '_', pathinfo((string)$orig, PATHINFO_FILENAME));
        $name = time() . '-' . bin2hex(random_bytes(3)) . '-' . mb_substr(trim($base, '._-') ?: 'file', 0, 60) . '.' . $ext;
        if (!move_uploaded_file($tmps[$i], "$dir/$name")) fail('Could not save the file on the server', 500);
        @chmod("$dir/$name", 0644);
        $saved[] = ['filename' => $name, 'url' => '/uploads/' . rawurlencode($name), 'type' => media_type_of($name), 'size' => filesize("$dir/$name")];
    }
    out(['success' => true, 'files' => $saved]);
}

function fn_delete_media(): void {
    require_perm('media');
    $b = body();
    $raw = is_array($b['filenames'] ?? null) ? $b['filenames'] : [$b['filename'] ?? ($b['name'] ?? ($b['path'] ?? ''))];
    $dir = uploads_dir();
    $deleted = [];
    foreach ($raw as $r) {
        $n = safe_upload_name((string)$r);
        if ($n && is_file("$dir/$n") && @unlink("$dir/$n")) $deleted[] = $n;
    }
    if (!$deleted) fail('File not found (already deleted?)', 404);
    out(['success' => true, 'deleted' => $deleted]);
}

/* =====================================================================
   PODCAST FEED
   ===================================================================== */
function podcast_feed(): void {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https' ? 'https' : 'http';
    $origin = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
    $x = fn($s) => htmlspecialchars((string)$s, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    $mimes = ['mp3' => 'audio/mpeg', 'm4a' => 'audio/mp4', 'aac' => 'audio/aac', 'wav' => 'audio/wav', 'ogg' => 'audio/ogg', 'oga' => 'audio/ogg', 'flac' => 'audio/flac'];
    $items = '';
    $rows = q("SELECT id, title, description, media_url, created_at FROM messages WHERE media_type = 'audio' AND media_url IS NOT NULL ORDER BY created_at DESC LIMIT 200")->fetchAll();
    foreach ($rows as $r) {
        $url = preg_match('#^https?://#i', $r['media_url']) ? $r['media_url'] : $origin . '/' . ltrim($r['media_url'], '/');
        $ext = strtolower(pathinfo(parse_url($url, PHP_URL_PATH) ?: '', PATHINFO_EXTENSION));
        $local = ($n = safe_upload_name(basename(parse_url($url, PHP_URL_PATH) ?: ''))) ? uploads_dir() . '/' . $n : '';
        $len = ($local && is_file($local)) ? filesize($local) : 0;
        $items .= '<item><title>' . $x($r['title']) . '</title><description>' . $x($r['description'] ?? '') . '</description>'
            . '<pubDate>' . gmdate('D, d M Y H:i:s', strtotime($r['created_at'] . ' UTC')) . ' +0000</pubDate>'
            . '<guid isPermaLink="false">' . $x($r['id']) . '</guid>'
            . '<enclosure url="' . $x($url) . '" length="' . $len . '" type="' . ($mimes[$ext] ?? 'audio/mpeg') . '"/></item>';
    }
    header('Content-Type: application/rss+xml; charset=utf-8');
    header('Cache-Control: public, max-age=600');
    echo '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>'
        . '<title>Prayer Army International - Messages</title><link>' . $x($origin) . '</link><language>en</language>'
        . '<description>Sermons and messages from Prayer Army International, Wa, Upper West Region, Ghana.</description>'
        . '<itunes:author>Prayer Army International</itunes:author><itunes:explicit>false</itunes:explicit>'
        . $items . '</channel></rss>';
    exit;
}
