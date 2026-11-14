<?php
// One-time setup: creates the tables and your first System admin account.
// Needs the SETUP_KEY from api/config.php. Stops working as soon as an account exists.
// After it succeeds, DELETE this file from the server.
define('PAI_API', true);
require __DIR__ . '/lib.php';

header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');
$h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');

function page(string $title, string $inner): void {
    echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
       . '<meta name="robots" content="noindex"><title>' . $title . '</title><style>'
       . 'body{font-family:system-ui,sans-serif;background:#0b1020;color:#e8ecf5;margin:0;display:grid;place-items:center;min-height:100vh;padding:20px}'
       . 'main{background:#141b33;border:1px solid #2a3560;border-radius:14px;padding:28px;max-width:440px;width:100%}'
       . 'h1{font-size:20px;margin:0 0 6px}p{color:#aab3cf;font-size:14px;line-height:1.5}label{display:block;margin:14px 0 4px;font-size:13px;color:#aab3cf}'
       . 'input{width:100%;box-sizing:border-box;padding:11px;border-radius:8px;border:1px solid #2a3560;background:#0b1020;color:#fff;font-size:15px}'
       . 'button{margin-top:20px;width:100%;padding:12px;border:0;border-radius:8px;background:#d4a017;color:#111;font-weight:700;font-size:15px;cursor:pointer}'
       . '.err{background:#3a1a1f;color:#f3a3ac;padding:10px;border-radius:8px;font-size:14px;margin-top:12px}.ok{background:#12351f;color:#a7f3c0;padding:10px;border-radius:8px;font-size:14px}'
       . 'a{color:#d4a017}</style></head><body><main>' . $inner . '</main></body></html>';
    exit;
}

if (str_contains(SETUP_KEY, 'CHANGE_ME') || strlen(SETUP_KEY) < 12) {
    page('Setup', '<h1>Almost there</h1><p>Open <code>api/config.php</code> and replace <b>SETUP_KEY</b> with a long secret phrase (12+ characters), and fill in the database details. Then reload this page.</p>');
}

try { db(); } catch (Throwable $e) { page('Setup', '<h1>Database problem</h1><p>Could not connect. Check DB_NAME, DB_USER and DB_PASS in <code>api/config.php</code>.</p>'); }

// Tables first (safe to repeat)
foreach (array_filter(array_map('trim', explode(';', (string)file_get_contents(__DIR__ . '/schema.sql')))) as $stmt) {
    if (preg_match('/^(--[^\n]*\n)*\s*$/', $stmt)) continue;
    db()->exec($stmt);
}

$exists = (int)q('SELECT COUNT(*) c FROM admin_users')->fetch()['c'] > 0;
if ($exists) page('Setup finished', '<h1>Setup is already done</h1><p>An administrator account exists, so this page is locked. <b>Please delete <code>api/setup.php</code> from your server.</b></p><p><a href="/admin">Go to the admin sign-in</a></p>');

$err = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $key = (string)($_POST['key'] ?? ''); $name = clean($_POST['name'] ?? '', 80);
    $email = strtolower(clean($_POST['email'] ?? '', 190)); $pw = (string)($_POST['password'] ?? '');
    if (!hash_equals(SETUP_KEY, $key)) { sleep(2); $err = 'That setup key is not correct.'; }
    elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) $err = 'Enter a valid email address.';
    elseif (mb_strlen($pw) < 10) $err = 'Use a password of at least 10 characters.';
    else {
        q('INSERT INTO admin_users (id, email, display_name, password_hash, role, active, created_at) VALUES (?,?,?,?,?,1,?)',
          [uuid(), $email, $name ?: $email, password_hash($pw, PASSWORD_DEFAULT), 'owner', now()]);
        q('INSERT IGNORE INTO admin_config (id, legacy_enabled) VALUES (1, 0)');
        $seed = dirname(__DIR__) . '/site-settings.json';
        if (is_file($seed) && !q('SELECT 1 FROM site_settings WHERE id = 1')->fetch()) {
            $j = json_decode((string)file_get_contents($seed), true);
            if (is_array($j)) { unset($j['passkey']); q('INSERT INTO site_settings (id, data, updated_at) VALUES (1, ?, ?)', [json_encode($j, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), now()]); }
        }
        page('Setup complete', '<h1>All set</h1><p class="ok">Your System admin account is ready and the website content has been loaded.</p>'
           . '<p><b>Next:</b> delete <code>api/setup.php</code> from the server, then <a href="/admin">sign in at /admin</a> with your email and password.</p>');
    }
}
page('Setup', '<h1>Prayer Army - first-time setup</h1><p>Tables are ready. Create your System admin account.</p>'
   . ($err ? '<div class="err">' . $h($err) . '</div>' : '')
   . '<form method="post" autocomplete="off"><label>Setup key (from api/config.php)</label><input type="password" name="key" required>'
   . '<label>Your name</label><input name="name" value="' . $h($_POST['name'] ?? '') . '" required>'
   . '<label>Email</label><input type="email" name="email" value="' . $h($_POST['email'] ?? '') . '" required>'
   . '<label>Password (10+ characters)</label><input type="password" name="password" minlength="10" required>'
   . '<button type="submit">Create admin account</button></form>');
