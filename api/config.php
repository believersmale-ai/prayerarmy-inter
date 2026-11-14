<?php
// ============================================================================
//  Prayer Army International - backend settings
//  Fill these in from hPanel > Databases > MySQL Databases, then visit
//  https://YOUR-DOMAIN.com/api/setup.php once to create the tables and your
//  first System admin account. Keep this file private; never share it.
// ============================================================================
if (!defined('PAI_API')) { http_response_code(403); exit; }

define('DB_HOST', 'localhost');
define('DB_NAME', 'u123456789_prayerarmy');   // full database name from hPanel
define('DB_USER', 'u123456789_prayerarmy');   // full database user from hPanel
define('DB_PASS', 'CHANGE_ME');               // the database password you set

// A long secret phrase only you know. It is needed once, on the setup page.
define('SETUP_KEY', 'CHANGE_ME_TO_A_LONG_SECRET_PHRASE');

// Largest single upload in MB (also raise upload_max_filesize / post_max_size
// in hPanel > Advanced > PHP Configuration if you want bigger videos).
define('MAX_UPLOAD_MB', 200);
