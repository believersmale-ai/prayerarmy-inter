<?php
// Agent-readiness layer: robots.txt (Content-Signal), sitemap, llms.txt, Markdown negotiation, Link headers,
// JSON-LD, 404 page, MCP server + MCP Server Card. Everything is generated from the site settings and the
// database, and the domain is taken from the request - nothing here is tied to one hostname.
if (!defined('PAI_API')) { http_response_code(403); exit; }

const MCP_PROTOCOL = '2025-06-18';
const SERVER_VERSION = '1.0.0';
const PAGES = ['home' => '/', 'about' => '/about', 'contact' => '/contact', 'privacy' => '/privacy', 'terms' => '/terms'];
const SIGNALS_DEFAULT = 'search=yes, ai-input=yes, ai-train=no';

/* ------------------------------------------------------------------ settings & site facts */
function a_root(): string { return dirname(__DIR__); }
function a_origin(): string {
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    $host = preg_replace('/[^A-Za-z0-9.:-]/', '', (string)($_SERVER['HTTP_HOST'] ?? 'localhost')) ?: 'localhost';
    return ($https ? 'https' : 'http') . '://' . $host;
}
function a_db_ok(): bool {
    static $ok = null;
    if ($ok === null) {
        try { new PDO('mysql:host=' . DB_HOST . (defined('DB_PORT') ? ';port=' . DB_PORT : '') . ';dbname=' . DB_NAME . ';charset=utf8mb4', DB_USER, DB_PASS, [PDO::ATTR_TIMEOUT => 3]); $ok = true; }
        catch (Throwable $e) { $ok = false; }
    }
    return $ok;
}
/** Defaults from site-settings.json, overridden group by group by what the admin saved in the database. */
function a_settings(): array {
    static $s = null;
    if ($s !== null) return $s;
    $d = json_decode((string)@file_get_contents(a_root() . '/site-settings.json'), true) ?: [];
    $db = [];
    if (a_db_ok()) { try { $db = site_settings(); } catch (Throwable $e) {} }
    foreach ($db as $k => $v) {
        $d[$k] = (is_array($v) && isset($d[$k]) && is_array($d[$k]) && array_keys($v) !== range(0, count($v) - 1)) ? array_merge($d[$k], $v) : $v;
    }
    return $s = $d;
}
function a_cfg(string $g, string $k, $default = '') { $v = a_settings()[$g][$k] ?? null; return ($v === null || $v === '') ? $default : $v; }
function a_text($s): string {
    $s = preg_replace('/\{\{\w+\}\}/', '', (string)$s);
    $s = str_replace(['**', '[[', ']]'], '', $s);
    return trim(preg_replace('/[ \t]+/', ' ', str_replace('|', ' ', $s)));
}
function a_abs(?string $u): string {
    $u = trim((string)$u);
    if ($u === '') return '';
    return preg_match('#^https?://#i', $u) ? $u : a_origin() . '/' . ltrim($u, '/');
}
function a_site(): array {
    $st = a_settings();
    $g = $st['general'] ?? [];
    $name = a_text($g['churchName'] ?? '') ?: 'Website';
    $same = [];
    foreach (['youtube', 'facebook', 'instagram', 'tiktok', 'x', 'telegram', 'threads', 'linkedin', 'spotify'] as $k) {
        $u = trim((string)($st['social'][$k] ?? ''));
        if (preg_match('#^https?://[^\s]+$#i', $u)) $same[] = $u;
    }
    $logo = $st['general']['logoUrl'] ?? ($st['media']['logo'] ?? 'assets/images/prayer-army-logo.png');
    return [
        'origin' => a_origin(), 'name' => $name, 'slogan' => a_text($g['slogan'] ?? ''), 'region' => a_text($g['region'] ?? ''),
        'founder' => a_text($g['founder'] ?? ''), 'founderRole' => a_text($st['about']['founderRole'] ?? ''),
        'desc' => a_text($st['seo']['description'] ?? '') ?: a_text($st['about']['p1'] ?? ''),
        'address' => a_text($st['contact']['address'] ?? ''), 'phone' => trim((string)($st['contact']['phone'] ?? '')),
        'email' => trim((string)($st['contact']['email'] ?? '')), 'whatsapp' => trim((string)($st['contact']['whatsapp'] ?? '')),
        'logo' => a_abs($logo), 'image' => a_abs($st['seo']['ogImage'] ?? ($st['hero']['bgImage'] ?? $logo)),
        'sameAs' => array_values(array_unique($same)), 'country' => (string)a_cfg('seo', 'countryCode', ''),
        'lang' => (string)a_cfg('seo', 'language', 'en'),
    ];
}
function a_signals(): string {
    $v = trim((string)a_cfg('seo', 'contentSignals', SIGNALS_DEFAULT));
    return preg_match('/^(search|ai-input|ai-train)=(yes|no)(\s*,\s*(search|ai-input|ai-train)=(yes|no))*$/', $v) ? $v : SIGNALS_DEFAULT;
}
function a_messages(int $limit = 50): array {
    if (!a_db_ok()) return [];
    try { return q('SELECT id, title, description, link, media_url, media_type, created_at FROM messages ORDER BY created_at DESC LIMIT ' . (int)$limit)->fetchAll(); }
    catch (Throwable $e) { return []; }
}
function a_events(): array {
    $st = a_settings();
    $list = array_merge(!empty($st['event']['title']) ? [$st['event']] : [], is_array($st['events'] ?? null) ? $st['events'] : []);
    return array_values(array_filter($list, fn($e) => is_array($e) && !empty($e['title']) && ($e['published'] ?? true) !== false));
}
function a_weekly(): array {
    $w = a_settings()['weekly'] ?? [];
    return is_array($w) ? array_values(array_filter($w, fn($x) => is_array($x) && !empty($x['title']))) : [];
}
function a_youtube_id(string $url): string {
    return preg_match('#(?:youtu\.be/|youtube\.com/(?:watch\?v=|embed/|shorts/))([A-Za-z0-9_-]{11})#', $url, $m) ? $m[1] : '';
}
function a_iso(string $v): string { $t = strtotime($v); return $t ? gmdate('Y-m-d\TH:i:s\Z', $t) : ''; }

/* ------------------------------------------------------------------ content negotiation + headers */
function a_wants_markdown(): bool {
    $acc = strtolower((string)($_SERVER['HTTP_ACCEPT'] ?? ''));
    if (!str_contains($acc, 'text/markdown')) return false;
    preg_match('#text/markdown\s*(?:;\s*q=([0-9.]+))?#', $acc, $m);
    $q = isset($m[1]) && $m[1] !== '' ? (float)$m[1] : 1.0;
    preg_match('#text/html\s*(?:;\s*q=([0-9.]+))?#', $acc, $h);
    $qh = !$h ? 0.0 : ((isset($h[1]) && $h[1] !== '') ? (float)$h[1] : 1.0);
    return $q > 0 && $q >= $qh;
}
function a_link_header(string $page): void {
    $o = a_origin();
    $md = $o . ($page === 'home' ? '/index.md' : '/' . $page . '.md');
    header('Link: <' . $o . '/llms.txt>; rel="describedby"; type="text/plain", <' . $md . '>; rel="alternate"; type="text/markdown", <'
        . $o . '/sitemap.xml>; rel="sitemap"; type="application/xml", <' . $o . '/.well-known/mcp/server-card.json>; rel="mcp-server-card"; type="application/json"', false);
    header('Vary: Accept');
}
function a_cache_html(): void { header('Cache-Control: public, max-age=0, must-revalidate'); }

/* ------------------------------------------------------------------ JSON-LD */
function a_hours(): array {
    $days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    $out = [];
    foreach (a_weekly() as $w) {
        $day = trim((string)($w['day'] ?? ''));
        if (!preg_match_all('/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i', (string)($w['time'] ?? ''), $m, PREG_SET_ORDER) || count($m) < 2) continue;
        $to24 = function ($x, $fallbackAp) {
            $ap = strtolower($x[3] ?? '') ?: $fallbackAp; $h = (int)$x[1]; $mi = (int)($x[2] ?? 0);
            if ($h > 24 || $mi > 59) return null;
            if ($ap === 'pm' && $h < 12) $h += 12; if ($ap === 'am' && $h === 12) $h = 0;
            return sprintf('%02d:%02d', $h % 24, $mi);
        };
        $ap2 = strtolower($m[1][3] ?? '');
        $opens = $to24($m[0], $ap2); $closes = $to24($m[1], '');
        if (!$opens || !$closes) continue;
        $dow = strcasecmp($day, 'Every day') === 0 ? $days : array_values(array_filter($days, fn($d) => strcasecmp($d, $day) === 0));
        foreach ($dow as $d) $out[] = ['@type' => 'OpeningHoursSpecification', 'dayOfWeek' => $d, 'opens' => $opens, 'closes' => $closes];
    }
    return $out;
}
function a_graph(string $page): array {
    $s = a_site(); $o = $s['origin'];
    $org = $o . '/#organization'; $church = $o . '/#church'; $web = $o . '/#website'; $founder = $o . '/#founder';
    $url = $o . (PAGES[$page] ?? '/');
    $st = a_settings();
    $address = ['@type' => 'PostalAddress'];
    if ($s['address']) $address['streetAddress'] = $s['address'];
    if ($s['region']) $address['addressRegion'] = $s['region'];
    if ($s['country']) $address['addressCountry'] = $s['country'];
    $logo = $s['logo'] ? ['@type' => 'ImageObject', '@id' => $o . '/#logo', 'url' => $s['logo'], 'contentUrl' => $s['logo']] : null;
    $contact = ['@type' => 'ContactPoint', 'contactType' => 'customer support', 'availableLanguage' => $s['lang']];
    if ($s['email']) $contact['email'] = $s['email'];
    if ($s['phone']) $contact['telephone'] = $s['phone'];
    $orgNode = array_filter([
        '@type' => 'Organization', '@id' => $org, 'name' => $s['name'], 'url' => $o . '/', 'description' => $s['desc'] ?: null,
        'slogan' => $s['slogan'] ?: null, 'logo' => $logo, 'image' => $s['image'] ?: null, 'email' => $s['email'] ?: null,
        'telephone' => $s['phone'] ?: null, 'address' => count($address) > 1 ? $address : null, 'sameAs' => $s['sameAs'] ?: null,
        'founder' => $s['founder'] ? ['@id' => $founder] : null, 'location' => ['@id' => $church],
        'contactPoint' => count($contact) > 3 ? [$contact] : null,
    ], fn($v) => $v !== null);
    $churchNode = array_filter([
        '@type' => 'Church', '@id' => $church, 'name' => $s['name'], 'url' => $o . '/', 'image' => $s['image'] ?: null,
        'description' => $s['desc'] ?: null, 'address' => count($address) > 1 ? $address : null, 'telephone' => $s['phone'] ?: null,
        'email' => $s['email'] ?: null, 'sameAs' => $s['sameAs'] ?: null, 'openingHoursSpecification' => a_hours() ?: null,
    ], fn($v) => $v !== null);
    $graph = [$orgNode, $churchNode];
    if ($s['founder']) $graph[] = array_filter(['@type' => 'Person', '@id' => $founder, 'name' => $s['founder'], 'jobTitle' => $s['founderRole'] ?: null,
        'description' => a_text($st['foundation']['founderBio'] ?? '') ?: null, 'worksFor' => ['@id' => $org]], fn($v) => $v !== null);
    $graph[] = ['@type' => 'WebSite', '@id' => $web, 'url' => $o . '/', 'name' => $s['name'], 'publisher' => ['@id' => $org], 'inLanguage' => $s['lang']];
    $type = ['about' => 'AboutPage', 'contact' => 'ContactPage'][$page] ?? 'WebPage';
    $titles = ['home' => $s['name'], 'about' => 'About ' . $s['name'], 'contact' => 'Contact ' . $s['name'], 'privacy' => 'Privacy Policy', 'terms' => 'Terms & Conditions'];
    $wp = ['@type' => $type, '@id' => $url . '#webpage', 'url' => $url, 'name' => $titles[$page] ?? $s['name'], 'isPartOf' => ['@id' => $web],
        'about' => ['@id' => $org], 'inLanguage' => $s['lang'], 'breadcrumb' => ['@id' => $url . '#breadcrumb']];
    if ($s['desc']) $wp['description'] = $s['desc'];
    if ($s['image']) $wp['primaryImageOfPage'] = ['@type' => 'ImageObject', 'url' => $s['image']];
    $graph[] = $wp;
    $crumbs = [['@type' => 'ListItem', 'position' => 1, 'name' => 'Home', 'item' => $o . '/']];
    if ($page !== 'home') $crumbs[] = ['@type' => 'ListItem', 'position' => 2, 'name' => $titles[$page] ?? $page, 'item' => $url];
    $graph[] = ['@type' => 'BreadcrumbList', '@id' => $url . '#breadcrumb', 'itemListElement' => $crumbs];

    if ($page === 'home') {
        foreach (a_events() as $e) {
            $start = a_iso((string)($e['start'] ?? ''));
            if (!$start) continue;
            $end = a_iso((string)($e['end'] ?? ''));
            $graph[] = array_filter(['@type' => 'Event', 'name' => a_text($e['title']), 'startDate' => $start, 'endDate' => $end ?: null,
                'description' => a_text($e['description'] ?? '') ?: null, 'url' => a_abs($e['link'] ?? '') ?: $o . '/#events',
                'eventStatus' => 'https://schema.org/EventScheduled', 'eventAttendanceMode' => 'https://schema.org/OfflineEventAttendanceMode',
                'location' => ['@id' => $church], 'organizer' => ['@id' => $org]], fn($v) => $v !== null);
        }
        $items = []; $hasAudio = false;
        foreach (a_messages(10) as $i => $m) {
            $mu = $o . '/?m=' . $m['id']; $date = a_iso((string)$m['created_at'] . ' UTC');
            $n = array_filter(['name' => a_text($m['title']), 'description' => a_text($m['description'] ?? '') ?: null, 'url' => $mu, 'uploadDate' => $date ?: null], fn($v) => $v !== null);
            $yt = a_youtube_id((string)$m['link']);
            if ($m['media_type'] === 'audio' && $m['media_url']) { $n = ['@type' => 'AudioObject', 'contentUrl' => a_abs($m['media_url'])] + $n; $hasAudio = true; }
            elseif (($m['media_type'] === 'video' && $m['media_url']) || $yt) {
                $n = ['@type' => 'VideoObject', 'thumbnailUrl' => $yt ? "https://i.ytimg.com/vi/$yt/hqdefault.jpg" : $s['image']] + $n;
                if ($yt) $n['embedUrl'] = "https://www.youtube.com/embed/$yt"; else $n['contentUrl'] = a_abs($m['media_url']);
            } else $n = ['@type' => 'CreativeWork'] + $n;
            $items[] = ['@type' => 'ListItem', 'position' => $i + 1, 'item' => $n];
        }
        if ($items) $graph[] = ['@type' => 'ItemList', '@id' => $o . '/#sermons', 'name' => 'Latest messages', 'itemListElement' => $items];
        if ($hasAudio) $graph[] = ['@type' => 'PodcastSeries', 'name' => $s['name'] . ' - Messages', 'url' => $o . '/', 'webFeed' => $o . '/podcast.xml', 'publisher' => ['@id' => $org]];
    }
    return $graph;
}
function a_jsonld(string $page): string {
    return '<script type="application/ld+json">' . json_encode(['@context' => 'https://schema.org', '@graph' => a_graph($page)],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP) . '</script>';
}

/* ------------------------------------------------------------------ Markdown */
function a_md(string $page): string {
    $s = a_site(); $o = $s['origin']; $st = a_settings(); $f = $st['foundation'] ?? []; $ab = $st['about'] ?? [];
    $L = [];
    $para = function ($t) use (&$L) { $t = a_text($t); if ($t !== '') { $L[] = $t; $L[] = ''; } };
    $contact = function () use (&$L, $s) {
        $L[] = '## Contact'; $L[] = '';
        if ($s['address']) $L[] = '- Address: ' . $s['address'];
        if ($s['phone']) $L[] = '- Phone: ' . $s['phone'];
        if ($s['whatsapp']) $L[] = '- WhatsApp: ' . $s['whatsapp'];
        if ($s['email']) $L[] = '- Email: ' . $s['email'];
        foreach ($s['sameAs'] as $u) $L[] = '- ' . parse_url($u, PHP_URL_HOST) . ': ' . $u;
        $L[] = '';
    };
    $weekly = function () use (&$L) {
        if (!($w = a_weekly())) return;
        $L[] = '## Weekly activities'; $L[] = '';
        foreach ($w as $x) $L[] = '- **' . a_text($x['title']) . '**: ' . trim(a_text($x['day'] ?? '') . ' ' . a_text($x['time'] ?? '')) . (empty($x['location']) ? '' : ' (' . a_text($x['location']) . ')');
        $L[] = '';
    };
    $found = function () use (&$L, $f, $para) {
        foreach ([['missionTitle', 'missionText', 'Mission'], ['visionTitle', 'visionText', 'Vision'], ['valuesTitle', 'valuesText', 'Values'], ['storyTitle', 'storyText', 'Our story']] as [$t, $x, $h]) {
            if (!empty($f[$x])) { $L[] = "## $h"; $L[] = ''; if (!empty($f[$t])) $L[] = '**' . a_text($f[$t]) . '**'; $L[] = ''; $para($f[$x]); }
        }
    };
    if ($page === 'home') {
        $L[] = '# ' . $s['name']; $L[] = '';
        if ($s['slogan']) $L[] = '> ' . $s['slogan'] . ($s['region'] ? ' - ' . $s['region'] : ''); $L[] = '';
        $para($s['desc']);
        $L[] = '## About'; $L[] = ''; $para($ab['p1'] ?? ''); $para($ab['p2'] ?? '');
        if ($s['founder']) { $L[] = 'Founder: ' . $s['founder'] . ($s['founderRole'] && strcasecmp($s['founderRole'], 'Founder') ? ' (' . $s['founderRole'] . ')' : ''); $L[] = ''; }
        $found();
        if (($ev = a_events())) { $L[] = '## Events'; $L[] = '';
            foreach ($ev as $e) $L[] = '- **' . a_text($e['title']) . '**' . (empty($e['dates']) ? '' : ' - ' . a_text($e['dates'])) . (empty($e['description']) ? '' : ': ' . a_text($e['description']));
            $L[] = ''; }
        $weekly();
        if (($m = a_messages(10))) { $L[] = '## Latest messages'; $L[] = '';
            foreach ($m as $x) $L[] = '- [' . a_text($x['title']) . '](' . $o . '/?m=' . $x['id'] . ') - ' . substr((string)$x['created_at'], 0, 10);
            $L[] = ''; }
        if (!empty($st['live']['url'])) { $L[] = '## Live services'; $L[] = ''; $para($st['live']['description'] ?? ''); $L[] = '- Watch: ' . $st['live']['url']; $L[] = ''; }
        $L[] = '## Prayer requests and testimonies'; $L[] = '';
        $L[] = 'Visitors can send a prayer request, add a request to the public prayer wall, share a testimony, or ask someone from the ministry to get in touch using the forms on the home page (' . $o . '/#prayer).'; $L[] = '';
        if (!empty($st['giving']['heading'])) { $L[] = '## ' . a_text($st['giving']['heading']); $L[] = ''; $para($st['giving']['info'] ?? ''); }
        $contact();
        $L[] = '## Pages'; $L[] = '';
        foreach (['about' => 'About us', 'contact' => 'Contact', 'privacy' => 'Privacy policy', 'terms' => 'Terms & conditions'] as $k => $t) $L[] = "- [$t]($o" . PAGES[$k] . ')';
        $L[] = "- [Sitemap]($o/sitemap.xml)"; $L[] = "- [llms.txt]($o/llms.txt)"; $L[] = "- [Podcast feed]($o/podcast.xml)"; $L[] = '';
    } elseif ($page === 'about') {
        $L[] = '# About ' . $s['name']; $L[] = '';
        if ($s['slogan']) $L[] = '> ' . $s['slogan']; $L[] = '';
        $para($ab['p1'] ?? ''); $para($ab['p2'] ?? '');
        if ($s['founder']) { $L[] = '## Founder'; $L[] = ''; $L[] = '**' . $s['founder'] . '**' . ($s['founderRole'] ? ', ' . $s['founderRole'] : ''); $L[] = ''; $para($f['founderBio'] ?? ''); }
        $found();
        $fs = $st['content']['faithStatements'] ?? '';
        $fs = is_array($fs) ? $fs : preg_split('/\R+/', (string)$fs);
        if (array_filter($fs)) { $L[] = '## ' . (a_text($st['content']['faithHeading'] ?? '') ?: 'What we believe'); $L[] = ''; foreach ($fs as $x) if (trim((string)$x) !== '') $L[] = '- ' . a_text($x); $L[] = ''; }
        $weekly();
        $L[] = "Back to the [home page]($o/) - [Contact]($o/contact)"; $L[] = '';
    } elseif ($page === 'contact') {
        $L[] = '# Contact ' . $s['name']; $L[] = '';
        $para('Reach the ministry by phone, WhatsApp, email or social media, or use the forms on the home page for prayer requests and first-time visitors.');
        $contact(); $weekly();
        $L[] = "- Prayer request form: $o/#prayer"; $L[] = "- Connect with us: $o/#connect"; $L[] = '';
    }
    return rtrim(implode("\n", $L)) . "\n";
}
function a_html_to_md_basic(string $html): string {
    $html = preg_replace('#<(script|style|nav|svg|form|button|noscript|head)\b.*?</\1>#is', '', $html);
    $html = preg_replace('#<div[^>]*privacy-bar.*?</div>#is', '', $html);
    foreach ([1, 2, 3, 4] as $n) $html = preg_replace_callback("#<h$n\b[^>]*>(.*?)</h$n>#is", fn($m) => "\n\n" . str_repeat('#', $n) . ' ' . trim(strip_tags($m[1])) . "\n\n", $html);
    $html = preg_replace_callback('#<a\b[^>]*href="([^"]*)"[^>]*>(.*?)</a>#is', fn($m) => '[' . trim(strip_tags($m[2])) . '](' . $m[1] . ')', $html);
    $html = preg_replace('#<(strong|b)\b[^>]*>(.*?)</\1>#is', '**$2**', $html);
    $html = preg_replace('#<li\b[^>]*>#i', "\n- ", $html);
    $html = preg_replace('#</?(p|ul|ol|div|section|article|main|br)\b[^>]*>#i', "\n\n", $html);
    $t = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $t = preg_replace('/[ \t]+/', ' ', $t);
    return trim(preg_replace("/\n[ \t]*\n(\s*\n)+/", "\n\n", $t)) . "\n";
}
function a_html_to_md(string $html): string {
    if (!class_exists('DOMDocument')) return a_html_to_md_basic($html);
    $dom = new DOMDocument();
    @$dom->loadHTML('<?xml encoding="utf-8"?>' . $html, LIBXML_NOERROR | LIBXML_NOWARNING);
    foreach (['script', 'style', 'nav', 'svg', 'form', 'button', 'noscript'] as $tag) {
        foreach (iterator_to_array($dom->getElementsByTagName($tag)) as $n) $n->parentNode?->removeChild($n);
    }
    $xp = new DOMXPath($dom);
    foreach ($xp->query('//*[contains(@class,"privacy-bar")]') as $n) $n->parentNode?->removeChild($n);
    $walk = function (DOMNode $n) use (&$walk): string {
        if ($n->nodeType === XML_TEXT_NODE) return preg_replace('/\s+/', ' ', $n->textContent);
        if ($n->nodeType !== XML_ELEMENT_NODE) return '';
        $in = ''; foreach ($n->childNodes as $c) $in .= $walk($c);
        $t = strtolower($n->nodeName);
        return match (true) {
            $t === 'h1' => "\n\n# " . trim($in) . "\n\n", $t === 'h2' => "\n\n## " . trim($in) . "\n\n", $t === 'h3' => "\n\n### " . trim($in) . "\n\n",
            $t === 'h4' => "\n\n#### " . trim($in) . "\n\n", $t === 'p' => "\n\n" . trim($in) . "\n\n", $t === 'li' => "\n- " . trim($in),
            $t === 'ul' || $t === 'ol' => "\n" . $in . "\n", $t === 'br' => "\n", $t === 'strong' || $t === 'b' => '**' . trim($in) . '**',
            $t === 'em' || $t === 'i' => '_' . trim($in) . '_',
            $t === 'a' && $n->getAttribute('href') !== '' => '[' . trim($in) . '](' . $n->getAttribute('href') . ')',
            default => $in,
        };
    };
    $body = $dom->getElementsByTagName('body')->item(0);
    return trim(preg_replace("/\n{3,}/", "\n\n", $body ? $walk($body) : '')) . "\n";
}
function a_send_md(string $md): void {
    header('Content-Type: text/markdown; charset=utf-8');
    header('Vary: Accept');
    header('x-markdown-tokens: ' . (int)ceil(strlen($md) / 4));
    header('Content-Signal: ' . a_signals());
    header('Cache-Control: public, max-age=300');
    echo $md; exit;
}

/* ------------------------------------------------------------------ pages */
function a_shell(string $page, string $title, string $desc, string $main): string {
    $s = a_site(); $o = $s['origin']; $e = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
    $url = $o . (PAGES[$page] ?? '/');
    return '<!doctype html><html lang="' . $e($s['lang']) . '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
        . '<title>' . $e($title) . ' | ' . $e($s['name']) . '</title><meta name="description" content="' . $e($desc) . '">'
        . '<link rel="canonical" href="' . $e($url) . '"><link rel="alternate" type="text/markdown" href="' . $e($o . '/' . $page . '.md') . '">'
        . '<link rel="icon" href="' . $e($s['logo']) . '"><meta name="theme-color" content="' . $e(a_settings()['brand']['colors']['navyDeep'] ?? '#0b101b') . '">'
        . '<meta property="og:title" content="' . $e($title) . '"><meta property="og:description" content="' . $e($desc) . '"><meta property="og:url" content="' . $e($url) . '">'
        . '<meta property="og:image" content="' . $e($s['image']) . '"><meta property="og:type" content="website">'
        . '<link rel="stylesheet" href="/styles.css">'
        . '<style>.pg{max-width:820px;margin:0 auto;padding:130px 22px 90px}.pg h1{font-size:clamp(34px,5vw,50px);margin:0 0 14px}.pg h2{font-size:26px;margin:38px 0 10px}.pg p,.pg li{font-size:17px;line-height:1.75}'
        . '.pg .lead{font-size:19px;color:var(--soft)}.bar{position:fixed;top:0;left:0;right:0;z-index:20;background:var(--navy2);padding:12px 22px;display:flex;align-items:center;justify-content:space-between}'
        . '.bar a{color:#fff;font-weight:600;font-size:14px}.bar img{height:40px;width:auto}.pg dl{display:grid;grid-template-columns:130px 1fr;gap:8px 16px}.pg dt{font-weight:700}.pg dd{margin:0}</style>'
        . a_jsonld($page) . '</head><body><div class="bar"><a href="/"><img src="' . $e($s['logo']) . '" alt="' . $e($s['name']) . '"></a>'
        . '<span><a href="/about">About</a> &nbsp; <a href="/contact">Contact</a> &nbsp; <a href="/">&larr; Home</a></span></div><main class="pg">' . $main . '</main>'
        . '<script src="/agent-tools.js" defer></script></body></html>';
}
function a_render_about(): string {
    $s = a_site(); $st = a_settings(); $f = $st['foundation'] ?? []; $e = fn($v) => htmlspecialchars(a_text($v), ENT_QUOTES, 'UTF-8');
    $h = '<h1>About ' . $e($s['name']) . '</h1>' . ($s['slogan'] ? '<p class="lead">' . $e($s['slogan']) . '</p>' : '')
        . '<p>' . $e($st['about']['p1'] ?? '') . '</p><p>' . $e($st['about']['p2'] ?? '') . '</p>';
    if ($s['founder']) $h .= '<h2>Founder</h2><p><strong>' . $e($s['founder']) . '</strong>' . ($s['founderRole'] ? ', ' . $e($s['founderRole']) : '') . '</p><p>' . $e($f['founderBio'] ?? '') . '</p>';
    foreach ([['missionTitle', 'missionText', 'Mission'], ['visionTitle', 'visionText', 'Vision'], ['valuesTitle', 'valuesText', 'Values'], ['storyTitle', 'storyText', 'Our story']] as [$t, $x, $l]) {
        if (!empty($f[$x])) $h .= '<h2>' . $l . '</h2>' . (!empty($f[$t]) ? '<p><strong>' . $e($f[$t]) . '</strong></p>' : '') . '<p>' . $e($f[$x]) . '</p>';
    }
    $fs = $st['content']['faithStatements'] ?? ''; $fs = is_array($fs) ? $fs : preg_split('/\R+/', (string)$fs);
    if (array_filter($fs)) { $h .= '<h2>' . $e($st['content']['faithHeading'] ?? 'What we believe') . '</h2><ul>'; foreach ($fs as $x) if (trim((string)$x) !== '') $h .= '<li>' . $e($x) . '</li>'; $h .= '</ul>'; }
    $h .= '<p><a class="btn btn-gold" href="/contact">Contact us</a> &nbsp; <a class="text-link" href="/">Back to the home page</a></p>';
    return a_shell('about', 'About us', $s['desc'], $h);
}
function a_render_contact(): string {
    $s = a_site(); $e = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
    $h = '<h1>Contact ' . $e($s['name']) . '</h1><p class="lead">We would love to hear from you.</p><dl>';
    if ($s['address']) $h .= '<dt>Address</dt><dd>' . $e($s['address']) . '</dd>';
    if ($s['phone']) $h .= '<dt>Phone</dt><dd><a href="tel:' . $e(preg_replace('/[^\d+]/', '', $s['phone'])) . '">' . $e($s['phone']) . '</a></dd>';
    if ($s['whatsapp']) $h .= '<dt>WhatsApp</dt><dd><a href="https://wa.me/' . $e(preg_replace('/\D/', '', $s['whatsapp'])) . '">' . $e($s['whatsapp']) . '</a></dd>';
    if ($s['email']) $h .= '<dt>Email</dt><dd><a href="mailto:' . $e($s['email']) . '">' . $e($s['email']) . '</a></dd>';
    foreach ($s['sameAs'] as $u) $h .= '<dt>' . $e(preg_replace('/^www\./', '', (string)parse_url($u, PHP_URL_HOST))) . '</dt><dd><a href="' . $e($u) . '" rel="noopener">' . $e($u) . '</a></dd>';
    $h .= '</dl>';
    if (($w = a_weekly())) { $h .= '<h2>Weekly activities</h2><ul>'; foreach ($w as $x) $h .= '<li><strong>' . $e(a_text($x['title'])) . '</strong> - ' . $e(trim(a_text($x['day'] ?? '') . ' ' . a_text($x['time'] ?? ''))) . '</li>'; $h .= '</ul>'; }
    $h .= '<p><a class="btn btn-gold" href="/#prayer">Send a prayer request</a> &nbsp; <a class="text-link" href="/#connect">New here? Connect with us</a></p>';
    return a_shell('contact', 'Contact us', 'How to reach ' . $s['name'] . ': address, phone, email and social channels.', $h);
}
/** Serve a static HTML file (home, privacy, terms) with the live domain, SEO overrides, JSON-LD and agent headers. */
function a_render_file(string $page): string {
    $file = a_root() . '/' . ($page === 'home' ? 'index' : $page) . '.html';
    $html = (string)@file_get_contents($file);
    if ($html === '') return '';
    $s = a_site(); $o = $s['origin']; $st = a_settings(); $e = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
    $html = str_replace('https://YOUR-DOMAIN.com', $o, $html);
    $seo = $st['seo'] ?? [];
    $set = function (string $pattern, string $value) use (&$html, $e) { $html = preg_replace($pattern, '${1}' . str_replace(['\\', '$'], ['\\\\', '\\$'], $e($value)) . '${2}', $html, 1); };
    if (!empty($seo['title'])) { $html = preg_replace('#<title>.*?</title>#s', '<title>' . str_replace(['\\', '$'], ['\\\\', '\\$'], $e($seo['title'])) . '</title>', $html, 1);
        $set('#(<meta property="og:title" content=")[^"]*(")#', $seo['title']); $set('#(<meta name="twitter:title" content=")[^"]*(")#', $seo['title']); }
    if (!empty($seo['description'])) { foreach (['name="description"', 'property="og:description"', 'name="twitter:description"'] as $a) $set('#(<meta ' . $a . ' content=")[^"]*(")#', $seo['description']); }
    if (!empty($seo['ogImage'])) { $set('#(<meta property="og:image" content=")[^"]*(")#', a_abs($seo['ogImage'])); $set('#(<meta name="twitter:image" content=")[^"]*(")#', a_abs($seo['ogImage'])); }
    $ld = a_jsonld($page);
    $html = preg_match('#<script type="application/ld\+json">.*?</script>#s', $html) ? preg_replace('#<script type="application/ld\+json">.*?</script>#s', str_replace(['\\', '$'], ['\\\\', '\\$'], $ld), $html, 1) : str_replace('</head>', $ld . '</head>', $html);
    if (!str_contains($html, 'rel="canonical"')) $html = str_replace('</head>', '<link rel="canonical" href="' . $e($o . (PAGES[$page] ?? '/')) . '"></head>', $html);
    if (!str_contains($html, 'text/markdown')) $html = str_replace('</head>', '<link rel="alternate" type="text/markdown" href="' . $e($o . ($page === 'home' ? '/index.md' : '/' . $page . '.md')) . '"></head>', $html);
    return $html;
}
function a_page(string $page, bool $markdown): void {
    if ($markdown || a_wants_markdown()) {
        a_link_header($page);
        if (in_array($page, ['home', 'about', 'contact'], true)) a_send_md(a_md($page));
        $h = a_render_file($page);
        a_send_md(a_html_to_md($h));
    }
    $html = match ($page) { 'about' => a_render_about(), 'contact' => a_render_contact(), default => a_render_file($page) };
    if ($html === '') a_not_found();
    header('Content-Type: text/html; charset=utf-8');
    a_link_header($page); a_cache_html();
    echo $html; exit;
}
function a_not_found(): void {
    $s = a_site(); $e = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
    http_response_code(404);
    header('Content-Type: text/html; charset=utf-8'); header('X-Robots-Tag: noindex'); header('Cache-Control: no-store');
    echo '<!doctype html><html lang="' . $e($s['lang']) . '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">'
        . '<title>Page not found | ' . $e($s['name']) . '</title><link rel="stylesheet" href="/styles.css">'
        . '<style>.nf{min-height:100vh;display:grid;place-items:center;text-align:center;padding:40px 22px;background:var(--navy2);color:#fff}.nf h1{font-size:clamp(44px,9vw,96px);color:var(--gold2)}.nf a{color:var(--gold2);font-weight:700}</style></head>'
        . '<body><div class="nf"><div><img src="' . $e($s['logo']) . '" alt="" style="height:72px;margin:0 auto 24px"><h1>404</h1><p>This page could not be found.</p>'
        . '<p><a href="/">Go to the home page</a> &middot; <a href="/contact">Contact us</a> &middot; <a href="/sitemap.xml">Sitemap</a></p></div></div></body></html>';
    exit;
}

/* ------------------------------------------------------------------ robots, sitemap, llms.txt */
function a_robots(): void {
    $o = a_origin();
    header('Content-Type: text/plain; charset=utf-8'); header('Cache-Control: public, max-age=3600');
    echo "# " . a_site()['name'] . "\nUser-agent: *\nContent-Signal: " . a_signals() . "\nAllow: /\nDisallow: /admin\nDisallow: /manage\nDisallow: /portal\nDisallow: /api/\nDisallow: /uploads/\n\nSitemap: $o/sitemap.xml\n";
    exit;
}
function sitemap_xml(): void {
    $o = a_origin(); $x = fn($s) => htmlspecialchars((string)$s, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    $upd = null;
    if (a_db_ok()) { try { $r = q('SELECT updated_at FROM site_settings WHERE id = 1')->fetch(); $upd = $r ? substr((string)$r['updated_at'], 0, 10) : null; } catch (Throwable $e) {} }
    $urls = [[$o . '/', $upd ?: gmdate('Y-m-d'), '1.0'], [$o . '/about', $upd, '0.8'], [$o . '/contact', $upd, '0.8'], [$o . '/privacy', null, '0.3'], [$o . '/terms', null, '0.3']];
    foreach (a_messages(500) as $r) $urls[] = [$o . '/?m=' . $r['id'], substr((string)$r['created_at'], 0, 10), '0.6'];
    header('Content-Type: application/xml; charset=utf-8'); header('Cache-Control: public, max-age=3600');
    echo '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
    foreach ($urls as [$loc, $mod, $pri]) echo '<url><loc>' . $x($loc) . '</loc>' . ($mod ? '<lastmod>' . $x($mod) . '</lastmod>' : '') . '<priority>' . $pri . '</priority></url>';
    echo '</urlset>'; exit;
}
function a_llms(): void {
    $s = a_site(); $o = $s['origin'];
    $L = ['# ' . $s['name'], '', '> ' . ($s['desc'] ?: $s['slogan']), ''];
    if ($s['region'] || $s['founder']) $L[] = trim(($s['founder'] ? 'Founded by ' . $s['founder'] . '. ' : '') . ($s['region'] ? 'Based in ' . $s['region'] . '.' : '')) . "\n";
    $L[] = '## Pages'; $L[] = '';
    $L[] = "- [Home]($o/): ministry overview, sermons, events, prayer requests, giving";
    $L[] = "- [About us]($o/about): who we are, mission, vision, values, founder, statement of faith";
    $L[] = "- [Contact]($o/contact): address, phone, email and social channels";
    $L[] = "- [Privacy policy]($o/privacy): how information shared on this website is handled";
    $L[] = "- [Terms & conditions]($o/terms): terms of use"; $L[] = '';
    if (($m = a_messages(10))) { $L[] = '## Latest messages'; $L[] = ''; foreach ($m as $x) $L[] = '- [' . a_text($x['title']) . "]($o/?m={$x['id']}): " . substr((string)$x['created_at'], 0, 10); $L[] = ''; }
    $L[] = '## For agents'; $L[] = '';
    $L[] = "- [Markdown version of the home page]($o/index.md): also served from / when the request sends Accept: text/markdown";
    $L[] = "- [Sitemap]($o/sitemap.xml)"; $L[] = "- [Podcast feed]($o/podcast.xml)";
    $L[] = "- [MCP server card]($o/.well-known/mcp/server-card.json): read-only MCP tools at $o/mcp (church info, search, sermons, events, giving)";
    header('Content-Type: text/plain; charset=utf-8'); header('Cache-Control: public, max-age=3600');
    echo implode("\n", $L) . "\n"; exit;
}

/* ------------------------------------------------------------------ MCP server + server card */
function a_tools(): array {
    $ro = ['readOnlyHint' => true, 'openWorldHint' => false];
    $none = ['type' => 'object', 'properties' => new stdClass()];
    return [
        ['name' => 'get_organization_info', 'description' => 'Name, slogan, region, founder, address, phone, email and social links of the church.', 'inputSchema' => $none, 'annotations' => $ro],
        ['name' => 'search_site', 'description' => 'Search sermons, events, announcements and ministry information on the website.',
         'inputSchema' => ['type' => 'object', 'properties' => ['query' => ['type' => 'string', 'description' => 'Search words (at least 2 characters)']], 'required' => ['query']], 'annotations' => $ro],
        ['name' => 'list_sermons', 'description' => 'Latest sermons and messages with dates and links.',
         'inputSchema' => ['type' => 'object', 'properties' => ['limit' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 50, 'description' => 'How many to return (default 10)']]], 'annotations' => $ro],
        ['name' => 'get_events_and_services', 'description' => 'Upcoming events and the weekly service/activity schedule.', 'inputSchema' => $none, 'annotations' => $ro],
        ['name' => 'get_giving_info', 'description' => 'How to give or partner with the ministry (public details shown on the website).', 'inputSchema' => $none, 'annotations' => $ro],
    ];
}
function a_tool_call(string $name, array $args): array {
    $s = a_site(); $st = a_settings(); $o = $s['origin'];
    switch ($name) {
        case 'get_organization_info':
            return ['name' => $s['name'], 'slogan' => $s['slogan'], 'region' => $s['region'], 'founder' => $s['founder'], 'address' => $s['address'],
                'phone' => $s['phone'], 'email' => $s['email'], 'website' => $o . '/', 'profiles' => $s['sameAs'],
                'mission' => a_text($st['foundation']['missionText'] ?? ''), 'vision' => a_text($st['foundation']['visionText'] ?? '')];
        case 'search_site':
            $q = clean($args['query'] ?? '', 80);
            if (mb_strlen($q) < 2) throw new InvalidArgumentException('query must be at least 2 characters');
            $_GET['q'] = $q;
            return ['query' => $q, 'results' => array_map(fn($r) => $r + ['absoluteUrl' => $o . $r['url']], public_search_results($q))];
        case 'list_sermons':
            return ['sermons' => array_map(fn($m) => ['title' => a_text($m['title']), 'description' => a_text($m['description'] ?? ''), 'date' => substr((string)$m['created_at'], 0, 10),
                'url' => $o . '/?m=' . $m['id'], 'watchUrl' => $m['link'] ?: null, 'mediaUrl' => $m['media_url'] ? a_abs($m['media_url']) : null], a_messages(max(1, min(50, (int)($args['limit'] ?? 10)))))];
        case 'get_events_and_services':
            return ['events' => array_map(fn($e) => ['title' => a_text($e['title']), 'dates' => a_text($e['dates'] ?? ''), 'start' => $e['start'] ?? null, 'end' => $e['end'] ?? null,
                'description' => a_text($e['description'] ?? ''), 'link' => a_abs($e['link'] ?? '') ?: $o . '/#events'], a_events()),
                'weekly' => array_map(fn($w) => ['title' => a_text($w['title']), 'day' => a_text($w['day'] ?? ''), 'time' => a_text($w['time'] ?? ''), 'location' => a_text($w['location'] ?? '')], a_weekly())];
        case 'get_giving_info':
            $g = $st['giving'] ?? [];
            return ['heading' => a_text($g['heading'] ?? ''), 'info' => a_text($g['info'] ?? ''), 'note' => a_text($g['note'] ?? ''), 'link' => a_abs($g['link'] ?? '') ?: null,
                'methods' => array_map(fn($m) => ['type' => $m['type'] ?? '', 'title' => a_text($m['title'] ?? ''), 'details' => array_map(fn($r) => ['label' => $r['label'] ?? '', 'value' => $r['value'] ?? ''], $m['rows'] ?? [])], is_array($g['methods'] ?? null) ? $g['methods'] : []),
                'page' => $o . '/#give'];
    }
    throw new InvalidArgumentException('Unknown tool: ' . $name);
}
function a_mcp(): void {
    header('Access-Control-Allow-Origin: *'); header('Access-Control-Allow-Headers: Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version');
    header('Access-Control-Allow-Methods: POST, OPTIONS'); header('Cache-Control: no-store');
    $m = $_SERVER['REQUEST_METHOD'];
    if ($m === 'OPTIONS') { http_response_code(204); exit; }
    if ($m !== 'POST') { header('Allow: POST, OPTIONS'); out(['error' => 'This MCP endpoint accepts JSON-RPC over HTTP POST (Streamable HTTP).'], 405); }
    rate_guard('mcp', 240, 600);
    $raw = json_decode((string)file_get_contents('php://input'), true);
    if (json_last_error() !== JSON_ERROR_NONE) out(['jsonrpc' => '2.0', 'id' => null, 'error' => ['code' => -32700, 'message' => 'Parse error']], 400);
    if (!is_array($raw) || $raw === []) out(['jsonrpc' => '2.0', 'id' => null, 'error' => ['code' => -32600, 'message' => 'Invalid Request']], 400);
    $batch = array_is_list($raw); $reqs = $batch ? $raw : [$raw]; $res = [];
    foreach ($reqs as $r) {
        if (!is_array($r) || ($r['jsonrpc'] ?? '') !== '2.0' || !is_string($r['method'] ?? null)
            || (isset($r['params']) && !is_array($r['params']))) {
            $res[] = ['jsonrpc' => '2.0', 'id' => null, 'error' => ['code' => -32600, 'message' => 'Invalid Request']];
            continue;
        }
        $id = $r['id'] ?? null; $method = (string)($r['method'] ?? ''); $p = is_array($r['params'] ?? null) ? $r['params'] : [];
        if (!array_key_exists('id', $r)) continue;                       // notification: no response
        try {
            $result = match ($method) {
                'initialize' => ['protocolVersion' => MCP_PROTOCOL, 'capabilities' => ['tools' => ['listChanged' => false]],
                    'serverInfo' => ['name' => a_server_name(), 'title' => a_site()['name'], 'version' => SERVER_VERSION],
                    'instructions' => 'Read-only public information about ' . a_site()['name'] . '. No authentication needed.'],
                'ping' => new stdClass(),
                'tools/list' => ['tools' => a_tools()],
                'tools/call' => (function () use ($p) {
                    $out = a_tool_call((string)($p['name'] ?? ''), is_array($p['arguments'] ?? null) ? $p['arguments'] : []);
                    return ['content' => [['type' => 'text', 'text' => json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT)]], 'structuredContent' => $out, 'isError' => false];
                })(),
                default => throw new RuntimeException('Method not found', -32601),
            };
            $res[] = ['jsonrpc' => '2.0', 'id' => $id, 'result' => $result];
        } catch (InvalidArgumentException $e) {
            $res[] = ['jsonrpc' => '2.0', 'id' => $id, 'result' => ['content' => [['type' => 'text', 'text' => $e->getMessage()]], 'isError' => true]];
        } catch (RuntimeException $e) {
            $res[] = ['jsonrpc' => '2.0', 'id' => $id, 'error' => ['code' => $e->getCode() ?: -32603, 'message' => $e->getMessage()]];
        }
    }
    if (!$res) { http_response_code(202); exit; }
    out($batch ? $res : $res[0]);
}
function a_server_name(): string {
    $host = preg_replace('/^www\./', '', (string)parse_url(a_origin(), PHP_URL_HOST));
    return implode('.', array_reverse(explode('.', $host))) . '/website';
}
function a_server_card(): void {
    $s = a_site(); $o = $s['origin'];
    header('Access-Control-Allow-Origin: *'); header('Cache-Control: public, max-age=3600');
    out([
        '$schema' => 'https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json',
        'name' => a_server_name(), 'title' => $s['name'] . ' website', 'version' => SERVER_VERSION,
        'description' => 'Read-only access to public information about ' . $s['name'] . ': organisation details, sermons, events, service times and giving information.',
        'websiteUrl' => $o . '/', 'documentationUrl' => $o . '/llms.txt', 'iconUrl' => $s['logo'],
        'protocolVersion' => MCP_PROTOCOL, 'serverInfo' => ['name' => a_server_name(), 'title' => $s['name'], 'version' => SERVER_VERSION],
        'endpoint' => $o . '/mcp', 'transport' => ['type' => 'streamable-http', 'endpoint' => $o . '/mcp', 'url' => $o . '/mcp'],
        'capabilities' => ['tools' => ['listChanged' => false]], 'authentication' => ['required' => false],
        'tools' => array_map(fn($t) => ['name' => $t['name'], 'description' => $t['description']], a_tools()),
    ]);
}
