# Backend Parking App — Python, Lambda y RDS SQL Server

Este directorio se agrega en la raíz del repositorio Angular. Angular permanece sin cambios en la raíz y el backend queda aislado en `/backend`.

## Componentes

- `functions/auth`: registro e inicio de sesión.
- `functions/users`: consulta y edición del perfil autenticado.
- `functions/parkings`: listado público y CRUD del propietario.
- `functions/reservations`: creación, listado y cambio de estado.
- `layers/parking-shared-utils`: respuestas HTTP, CORS, lectura de eventos y validaciones.
- `layers/parking-auth-utils`: JWT y hash seguro de contraseñas.
- `layers/parking-database-utils`: conexión y consultas a RDS SQL Server mediante `pymssql`.
- `database/sql-server-schema.sql`: creación de tablas e índices.
- `template.yaml`: plantilla AWS SAM para API Gateway, Lambdas y capas.

## Runtime recomendado

- Python 3.12
- Arquitectura `x86_64`
- Handler: `lambda_function.lambda_handler`

Las cuatro funciones y las tres capas deben usar el mismo runtime y arquitectura.

## Importante sobre SQL Server

La función debe estar en la misma VPC que RDS si la instancia no es pública. El Security Group de RDS debe permitir TCP 1433 desde el Security Group de las Lambdas. No abras SQL Server a todo Internet.

`pymssql` contiene componentes nativos. Construye la capa dentro de Linux compatible con Lambda. No copies una instalación hecha directamente en Windows o macOS.

## Construir capas

Requisitos: Docker Desktop, `zip` y Bash.

```bash
cd backend
./scripts/build_layers_docker.sh
```

Se generan:

```text
backend/layers/parking-shared-utils.zip
backend/layers/parking-auth-utils.zip
backend/layers/parking-database-utils.zip
```

Cada ZIP tendrá `python/` en la raíz, como espera Lambda.

## Construir funciones

```bash
cd backend
./scripts/package_functions.sh
```

## Despliegue con AWS SAM

```bash
cd backend
sam build --use-container
sam deploy --guided
```

Durante `sam deploy --guided`, proporciona los valores de RDS y un secreto JWT largo. Para producción, reemplaza los parámetros de contraseña por AWS Secrets Manager.

## Creación manual en la consola AWS

1. Crea las tres capas y carga sus ZIP.
2. Selecciona Python 3.12 y `x86_64` como compatibilidad.
3. Crea las funciones `parking-auth`, `parking-users`, `parking-parkings` y `parking-reservations`.
4. Runtime: Python 3.12; arquitectura: `x86_64`; handler: `lambda_function.lambda_handler`.
5. Adjunta las tres capas a cada función.
6. Configura las variables indicadas en `env.example`.
7. Conecta las Lambdas a la VPC/subredes de RDS.
8. Crea las rutas de API Gateway indicadas en `template.yaml`.

## Rutas

| Método | Ruta | Uso |
|---|---|---|
| POST | `/auth/register` | Registrar conductor o propietario |
| POST | `/auth/login` | Iniciar sesión |
| GET | `/users/me` | Ver perfil |
| PATCH | `/users/me` | Editar perfil |
| GET | `/parkings` | Listar estacionamientos |
| GET | `/parkings/{id}` | Ver detalle |
| POST | `/parkings` | Crear estacionamiento (owner) |
| PATCH | `/parkings/{id}` | Editar estacionamiento (owner) |
| DELETE | `/parkings/{id}` | Desactivar estacionamiento (owner) |
| GET | `/reservations` | Listar reservas del usuario/propietario |
| POST | `/reservations` | Crear reserva (driver) |
| PATCH | `/reservations/{id}` | Cambiar estado |

## Conectar Angular

Configura en Angular una URL base de API Gateway, por ejemplo:

```typescript
export const environment = {
  production: false,
  apiUrl: 'https://TU_API.execute-api.REGION.amazonaws.com'
};
```

El login envía:

```json
{ "email": "usuario@correo.com", "password": "secreto" }
```

Las rutas protegidas deben enviar:

```text
Authorization: Bearer <token>
```

## Seguridad pendiente para producción

- Guardar credenciales en AWS Secrets Manager.
- Restringir CORS al dominio real de Amplify.
- Mantener RDS en subredes privadas.
- Activar logs y alarmas de CloudWatch.
- Usar migraciones y pruebas automatizadas antes de producción.
- ## Arquitectura Backend

El backend de ParkingApp fue desarrollado utilizando una arquitectura serverless sobre AWS.

### Componentes principales

- AWS Lambda para la lógica de negocio.
- Amazon API Gateway para exponer los servicios REST.
- Amazon RDS SQL Server como base de datos.
- GitHub como repositorio del código fuente.

### Flujo general

1. El usuario realiza una solicitud desde Angular.
2. API Gateway recibe la petición.
3. Lambda procesa la lógica.
4. Lambda consulta Amazon RDS.
5. La respuesta retorna al frontend.
