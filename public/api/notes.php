<?php
require 'config.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $data = readJson($DATA_DIR . 'notes.json');
    respondJson(['notes' => $data['notes'] ?? '']);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    requirePlanner();
    $body  = json_decode(file_get_contents('php://input'), true) ?? [];
    $notes = $body['notes'] ?? '';
    writeJson($DATA_DIR . 'notes.json', ['notes' => $notes]);
    respondJson(['ok' => true]);
}

respondJson(['error' => 'Method not allowed'], 405);
