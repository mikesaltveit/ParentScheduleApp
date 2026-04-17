<?php
// Temporary debug endpoint — remove after diagnosis
header('Content-Type: application/json');

$results = [];

// 1. Check paths
$results['cwd'] = getcwd();
$results['data_dir'] = '/data/';
$results['app_data_dir'] = '/app/data/';

// 2. Check /data
$results['data_exists']   = file_exists('/data');
$results['data_is_dir']   = is_dir('/data');
$results['data_writable'] = is_writable('/data');

// 3. Try to mkdir /data
if (!is_dir('/data')) {
    $mk = @mkdir('/data', 0755, true);
    $results['mkdir_data'] = $mk ? 'ok' : 'failed: ' . error_get_last()['message'] ?? 'unknown';
}

// 4. Write a test file to /data
$testFile = '/data/_test_' . time() . '.txt';
$written = @file_put_contents($testFile, 'hello');
$results['write_result'] = $written;
$results['write_file'] = $testFile;

// 5. Read it back immediately
$results['read_back'] = file_exists($testFile) ? file_get_contents($testFile) : 'NOT FOUND';

// 6. List /data
$results['data_listing'] = is_dir('/data') ? scandir('/data') : 'not a dir';

// 7. Check /app/data
$results['app_data_exists']   = file_exists('/app/data');
$results['app_data_is_dir']   = is_dir('/app/data');
$results['app_data_writable'] = is_writable('/app/data');
$results['app_data_listing']  = is_dir('/app/data') ? scandir('/app/data') : 'not a dir';

// 8. Try writing to /app/data
$testFile2 = '/app/data/_test_' . time() . '.txt';
$written2 = @file_put_contents($testFile2, 'hello');
$results['app_data_write_result'] = $written2;
$results['app_data_read_back'] = file_exists($testFile2) ? file_get_contents($testFile2) : 'NOT FOUND';

// 9. Show actual file contents
$results['data_events_json']     = file_exists('/data/events.json')     ? json_decode(file_get_contents('/data/events.json'), true)     : 'NOT FOUND';
$results['app_data_events_json'] = file_exists('/app/data/events.json') ? json_decode(file_get_contents('/app/data/events.json'), true) : 'NOT FOUND';

echo json_encode($results, JSON_PRETTY_PRINT);
