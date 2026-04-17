<?php
require 'config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respondJson(['error' => 'Method not allowed'], 405);
}

$body    = json_decode(file_get_contents('php://input'), true) ?? [];
$username = trim($body['username'] ?? '');
$password = $body['password'] ?? '';

foreach (USERS as $user) {
    if ($user['username'] === $username && $user['password'] === $password) {
        respondJson(['ok' => true, 'role' => $user['role'], 'token' => createToken($username, $user['role'])]);
    }
}

respondJson(['error' => 'Invalid username or password'], 401);
