<?php
require_once 'config.php';
requirePlanner();
$data = json_decode(file_get_contents('php://input'), true);
$id = $data['id'] ?? '';
if (!$id) respondJson(['error' => 'Missing id'], 400);
$events = readJson($DATA_DIR . 'events.json');
$events = array_values(array_filter($events, fn($e) => $e['id'] !== $id));
writeJson($DATA_DIR . 'events.json', $events);
respondJson(['ok' => true]);
