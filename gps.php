<?php
// CONFIGURA ESTOS DATOS
$host = 'localhost';
$db = 'nombre_de_tu_base';
$user = 'usuario_mysql';
$pass = 'contraseña_mysql';

// Conectar a la base de datos
$conn = new mysqli($host, $user, $pass, $db);

// Verificar conexión
if ($conn->connect_error) {
    die("Conexión fallida: " . $conn->connect_error);
}

// Leer datos del POST
$lat = isset($_POST['lat']) ? $_POST['lat'] : null;
$lng = isset($_POST['lng']) ? $_POST['lng'] : null;

if ($lat && $lng) {
    // Insertar en la base de datos
    $sql = "INSERT INTO ubicaciones (lat, lng, fecha) VALUES ('$lat', '$lng', NOW())";

    if ($conn->query($sql) === TRUE) {
        echo "Ubicación guardada correctamente";
    } else {
        echo "Error al guardar: " . $conn->error;
    }
} else {
    echo "Datos incompletos.";
}

$conn->close();
?>
