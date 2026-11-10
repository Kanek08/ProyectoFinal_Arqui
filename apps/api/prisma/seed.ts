/**
 * Datos de prueba de ReservaLab. Solo se ejecuta si la base está vacía (sin usuarios),
 * por eso es seguro correrlo en cada arranque del contenedor.
 */
import { PrismaClient } from '@prisma/client';
import { describeApiKey, generateApiKey, isApiKeyFormat } from '../src/lib/crypto';
import { argon2Hasher } from '../src/lib/password';

const prisma = new PrismaClient();

export const SEED_PASSWORD = 'Password123!';

/** Guatemala usa UTC-6 todo el año (sin horario de verano). */
const TZ_OFFSET = '-06:00';

function localDate(daysFromToday: number): string {
  const nowInGuatemala = new Date(Date.now() - 6 * 60 * 60 * 1000);
  nowInGuatemala.setUTCDate(nowInGuatemala.getUTCDate() + daysFromToday);
  return nowInGuatemala.toISOString().slice(0, 10);
}

function at(daysFromToday: number, time: string): Date {
  return new Date(`${localDate(daysFromToday)}T${time}:00${TZ_OFFSET}`);
}

async function main() {
  const users = await prisma.user.count();
  if (users > 0) {
    console.log('[seed] La base ya tiene datos, no se ejecuta el seed.');
    return;
  }

  const passwordHash = await argon2Hasher.hash(SEED_PASSWORD);
  const [admin, docente] = await Promise.all([
    prisma.user.create({
      data: { name: 'Administrador', email: 'admin@reservalab.edu', passwordHash, role: 'ADMIN' },
    }),
    prisma.user.create({
      data: { name: 'Docente Demo', email: 'docente@reservalab.edu', passwordHash, role: 'DOCENTE' },
    }),
    prisma.user.create({
      data: { name: 'Estudiante Demo', email: 'estudiante@reservalab.edu', passwordHash, role: 'ESTUDIANTE' },
    }),
  ]);

  const spaceData = [
    { name: 'Laboratorio de Cómputo 1', building: 'Edificio A', capacity: 30 },
    { name: 'Laboratorio de Cómputo 2', building: 'Edificio A', capacity: 25 },
    { name: 'Laboratorio de Redes', building: 'Edificio A', capacity: 20 },
    { name: 'Salón 101', building: 'Edificio B', capacity: 40 },
    { name: 'Salón 102', building: 'Edificio B', capacity: 40 },
    { name: 'Auditorio', building: 'Edificio B', capacity: 120 },
  ];
  const spaces = [];
  for (const s of spaceData) {
    spaces.push(await prisma.space.create({ data: { ...s, openTime: '07:00', closeTime: '21:00' } }));
  }
  const [lab1, lab2, redes, , , auditorio] = spaces;

  // Bloque "en curso": empieza en la hora actual para que GET /now muestre ocupación al demostrar.
  const currentHourStart = new Date();
  currentHourStart.setUTCMinutes(0, 0, 0);
  const currentHourEnd = new Date(currentHourStart.getTime() + 2 * 60 * 60 * 1000);

  await prisma.reservation.createMany({
    data: [
      {
        spaceId: lab1!.id,
        userId: docente.id,
        startAt: at(0, '08:00'),
        endAt: at(0, '10:00'),
        purpose: 'Programación I',
      },
      // Contiguo al anterior: el rango [) permite 10:00 justo cuando termina la otra.
      {
        spaceId: lab1!.id,
        userId: docente.id,
        startAt: at(0, '10:00'),
        endAt: at(0, '12:00'),
        purpose: 'Bases de Datos',
      },
      {
        spaceId: lab2!.id,
        userId: docente.id,
        startAt: currentHourStart,
        endAt: currentHourEnd,
        purpose: 'Clase en curso',
      },
      {
        spaceId: redes!.id,
        userId: docente.id,
        startAt: at(1, '09:00'),
        endAt: at(1, '11:00'),
        purpose: 'Redes II',
      },
      {
        spaceId: auditorio!.id,
        userId: admin.id,
        startAt: at(1, '15:00'),
        endAt: at(1, '17:00'),
        purpose: 'Charla de facultad',
      },
    ],
  });

  // Si .env define DISPLAY_API_KEY se registra esa key (la misma que la web recibe como
  // VITE_DISPLAY_API_KEY), así la pantalla funciona con un solo docker compose up.
  // Si no, se genera una aleatoria. En ambos casos solo se guarda el hash.
  const fromEnv = process.env.DISPLAY_API_KEY?.trim();
  if (fromEnv && !isApiKeyFormat(fromEnv)) {
    throw new Error('DISPLAY_API_KEY debe tener el formato rl_live_ + 32 caracteres [A-Za-z0-9_-]');
  }
  const apiKey = fromEnv ? describeApiKey(fromEnv) : generateApiKey();
  await prisma.apiKey.create({
    data: {
      name: 'Pantalla informativa (demo)',
      prefix: apiKey.prefix,
      keyHash: apiKey.hash,
      permissions: ['read:now', 'read:spaces', 'read:availability'],
    },
  });

  console.log('[seed] Usuarios: admin@, docente@, estudiante@reservalab.edu  contraseña: ' + SEED_PASSWORD);
  console.log(`[seed] ${spaces.length} espacios y 5 reservas creadas.`);
  console.log('[seed] ================================================================');
  console.log('[seed] API key de la pantalla (read:now, read:spaces, read:availability):');
  console.log(`[seed]   ${apiKey.key}`);
  console.log('[seed] ================================================================');
}

main()
  .catch((err) => {
    console.error('[seed] Error:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
