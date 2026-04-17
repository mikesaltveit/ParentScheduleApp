<?php
ini_set('display_errors', '0');

// Simple HMAC token auth — no sessions (sessions are unreliable in Wasmer Edge WASM)
define('TOKEN_SECRET', 'ff-secret-key-2024-xK9mP2qR');
define('TOKEN_TTL',    86400 * 30); // 30 days

// Add more planners here as needed
const USERS = [
    ['username' => 'mikal', 'password' => 'asdf', 'role' => 'planner'],
];

$DATA_DIR    = '/data/';
$UPLOADS_DIR = '/data/uploads/';

if (!is_dir($DATA_DIR))    mkdir($DATA_DIR,    0755, true);
if (!is_dir($UPLOADS_DIR)) mkdir($UPLOADS_DIR, 0755, true);

function respondJson($data, $status = 200) {
    http_response_code($status);
    header('Content-Type: application/json');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    echo json_encode($data);
    exit;
}

function b64url_encode($s) {
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}

function createToken($username, $role) {
    $payload = b64url_encode(json_encode(['u' => $username, 'r' => $role, 'e' => time() + TOKEN_TTL]));
    $sig     = b64url_encode(hash_hmac('sha256', $payload, TOKEN_SECRET, true));
    return $payload . '.' . $sig;
}

function validateToken() {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!$header && function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        $header  = $headers['Authorization'] ?? '';
    }
    if (!preg_match('/^Bearer\s+(.+)$/i', $header, $m)) return null;
    $token = $m[1];
    $parts = explode('.', $token);
    if (count($parts) !== 2) return null;
    [$payload, $sig] = $parts;
    $expected = b64url_encode(hash_hmac('sha256', $payload, TOKEN_SECRET, true));
    if (!hash_equals($expected, $sig)) return null;
    $data = json_decode(base64_decode(strtr($payload, '-_', '+/')), true);
    if (!$data || $data['e'] < time()) return null;
    return $data;
}

function requirePlanner() {
    $data = validateToken();
    if (!$data || ($data['r'] ?? '') !== 'planner') {
        respondJson(['error' => 'Unauthorized'], 401);
    }
}

function readJson($path) {
    if (!file_exists($path)) return [];
    $fp = @fopen($path, 'r');
    if (!$fp) return [];
    flock($fp, LOCK_SH);
    $content = stream_get_contents($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    return json_decode($content, true) ?? [];
}

function writeJson($path, $data) {
    $result = file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT), LOCK_EX);
    if ($result === false) {
        respondJson(['error' => 'Write failed: ' . $path . ' (dir writable: ' . (is_writable(dirname($path)) ? 'yes' : 'no') . ')'], 500);
    }
}
