<?php
ini_set('display_errors', '0');
ini_set('session.save_path', '/tmp');
session_start();

// Add more planners here as needed
const USERS = [
    ['username' => 'mikal', 'password' => 'asdf', 'role' => 'planner'],
];

$DATA_DIR  = __DIR__ . '/../data/';
$UPLOADS_DIR = __DIR__ . '/../uploads/';

function respondJson($data, $status = 200) {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

function requirePlanner() {
    if (empty($_SESSION['user']) || $_SESSION['user']['role'] !== 'planner') {
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
    file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT), LOCK_EX);
}
