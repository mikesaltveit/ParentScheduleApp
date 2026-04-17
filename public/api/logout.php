<?php
require 'config.php';
// Token-based auth: client discards token. Nothing to do server-side.
respondJson(['ok' => true]);
