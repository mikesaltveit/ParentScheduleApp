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
$toApprove  = null;
$newPending = [];

foreach ($pending as $event) {
    if ($event['id'] === $id) {
        $toApprove = $event;
    } else {
        $newPending[] = $event;
    }
}

if (!$toApprove) {
    respondJson(['error' => 'Event not found'], 404);
}

$events   = readJson($DATA_DIR . 'events.json');
$events[] = $toApprove;
writeJson($DATA_DIR . 'events.json',  $events);
writeJson($DATA_DIR . 'pending.json', $newPending);

respondJson(['ok' => true]);
