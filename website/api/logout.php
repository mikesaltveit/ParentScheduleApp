<?php
require 'config.php';

session_destroy();
respondJson(['ok' => true]);
