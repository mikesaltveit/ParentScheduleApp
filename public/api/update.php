<?php
require_once 'config.php';
requirePlanner();
$data = json_decode(file_get_contents('php://input'), true);
$id = $data['id'] ?? '';
if (!$id) respondJson(['error' => 'Missing id'], 400);
$events = readJson($DATA_DIR . 'events.json');
$idx = array_search($id, array_column($events, 'id'));
if ($idx === false) respondJson(['error' => 'Not found'], 404);
foreach (['title','location','type','price','startDate','endDate','ageGroups','times'] as $field) {
    if (array_key_exists($field, $data)) {
        $events[$idx][$field] = $data[$field];
    }
}
writeJson($DATA_DIR . 'events.json', $events);
respondJson(['ok' => true]);
