<?php
require 'config.php';
requirePlanner();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respondJson(['error' => 'Method not allowed'], 405);

$body   = json_decode(file_get_contents('php://input'), true) ?? [];
$month  = $body['month']  ?? '';
$events = $body['events'] ?? null;

if (!preg_match('/^\d{4}-\d{2}$/', $month)) respondJson(['error' => 'Invalid month'], 400);
if (!is_array($events)) respondJson(['error' => 'events must be an array'], 400);

// Remove existing events that overlap this month, keep everything else
$all = readJson($DATA_DIR . 'events.json');
$all = array_values(array_filter($all, function ($e) use ($month) {
    $start = substr($e['startDate'], 0, 7);
    $end   = !empty($e['endDate']) ? substr($e['endDate'], 0, 7) : $start;
    return !($start <= $month && $end >= $month);
}));

// Append imported events
$added = 0;
foreach ($events as $evt) {
    if (!empty($evt['id']) && !empty($evt['startDate'])) {
        $all[] = $evt;
        $added++;
    }
}

writeJson($DATA_DIR . 'events.json', $all);
respondJson(['ok' => true, 'count' => $added]);
