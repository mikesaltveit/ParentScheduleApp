<?php
require 'config.php';

// ── GET: return approved events for a given month ──────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $month  = preg_match('/^\d{4}-\d{2}$/', $_GET['month'] ?? '') ? $_GET['month'] : date('Y-m');
    $events = readJson($DATA_DIR . 'events.json');

    // Include any event whose date range overlaps the requested month
    $filtered = array_values(array_filter($events, function ($e) use ($month) {
        $start = substr($e['startDate'], 0, 7);
        $end   = !empty($e['endDate']) ? substr($e['endDate'], 0, 7) : $start;
        return $start <= $month && $end >= $month;
    }));

    respondJson($filtered);
}

// ── POST: submit a new event to the pending queue ─────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $title       = trim($_POST['title']       ?? '');
    $location    = trim($_POST['location']    ?? '');
    $type        = trim($_POST['type']        ?? '');
    $description = trim($_POST['description'] ?? '');
    $price       = max(0, (float)($_POST['price'] ?? 0));
    $startDate   = $_POST['startDate'] ?? '';
    $endDate     = $_POST['endDate']   ?? '';
    $timesJson   = $_POST['times']     ?? '[]';

    if (!$title || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $startDate)) {
        respondJson(['error' => 'Title and valid start date are required'], 400);
    }

    // Validate end date
    if ($endDate && (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $endDate) || $endDate < $startDate)) {
        $endDate = $startDate;
    }
    if (!$endDate) $endDate = $startDate;

    $times = json_decode($timesJson, true) ?? [];

    // Age groups
    $validGroups = ['infant','preschool','child','tween','teen','adult','senior','everyone'];
    $ageGroups   = json_decode($_POST['ageGroups'] ?? '[]', true) ?? [];
    $ageGroups   = array_values(array_filter($ageGroups, fn($g) => in_array($g, $validGroups)));
    // "everyone" overwrites all others
    if (in_array('everyone', $ageGroups)) $ageGroups = ['everyone'];

    // Handle flyer upload
    $flyerImage = null;
    if (!empty($_FILES['flyer']) && $_FILES['flyer']['error'] === UPLOAD_ERR_OK) {
        $ext     = strtolower(pathinfo($_FILES['flyer']['name'], PATHINFO_EXTENSION));
        $allowed = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        if (in_array($ext, $allowed)) {
            $filename = bin2hex(random_bytes(8)) . '.' . $ext;
            if (move_uploaded_file($_FILES['flyer']['tmp_name'], $UPLOADS_DIR . $filename)) {
                $flyerImage = 'uploads/' . $filename;
            }
        }
    }

    // Persist new type if not already known
    if ($type !== '') {
        $types = readJson($DATA_DIR . 'types.json');
        if (!in_array($type, $types)) {
            $types[] = $type;
            writeJson($DATA_DIR . 'types.json', $types);
        }
    }

    $event = [
        'id'          => 'evt_' . bin2hex(random_bytes(8)),
        'title'       => $title,
        'location'    => $location,
        'type'        => $type,
        'description' => $description,
        'price'       => $price,
        'startDate'   => $startDate,
        'endDate'     => $endDate,
        'times'       => $times,
        'ageGroups'   => $ageGroups,
        'flyerImage'  => $flyerImage,
        'submittedAt' => date('c'),
    ];

    $pending   = readJson($DATA_DIR . 'pending.json');
    $pending[] = $event;
    writeJson($DATA_DIR . 'pending.json', $pending);

    respondJson(['ok' => true, 'id' => $event['id']]);
}

respondJson(['error' => 'Method not allowed'], 405);
