<?php
require 'config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    respondJson(['error' => 'Method not allowed'], 405);
}

respondJson(readJson($DATA_DIR . 'types.json'));
