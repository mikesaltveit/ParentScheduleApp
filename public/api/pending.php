<?php
require 'config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    respondJson(['error' => 'Method not allowed'], 405);
}

requirePlanner();

respondJson(array_values(readJson($DATA_DIR . 'pending.json')));
