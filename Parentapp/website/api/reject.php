<?php
require 'config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respondJson(['error' => 'Method not allowed'], 405);
}

requirePlanner();

$body = json_decode(file_get_contents('php://input'), true) ?? [];
$id   = $body['id'] ?? '';

if (!$id) {
    respondJson(['error' => 'ID required'], 400);
}

$pending    = readJson($DATA_DIR . 'pending.json');
$newPending = array_values(array_filter($pending, fn($e) => $e['id'] !== $id));

if (count($newPending) === count($pending)) {
    respondJson(['error' => 'Event not found'], 404);
}

writeJson($DATA_DIR . 'pending.json', $newPending);
respondJson(['ok' => true]);
