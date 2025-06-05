// main.js
import { db, ref, push, set, get } from './firebase-config.js'; // Importa las funciones de Realtime Database

document.addEventListener('DOMContentLoaded', async () => {
    const reservationForm = document.getElementById('reservationForm');
    const roomNumberInput = document.getElementById('roomNumber');
    const guestNameInput = document.getElementById('guestName');
    const restaurantSelect = document.getElementById('restaurant');
    const timeSlotSelect = document.getElementById('timeSlot');
    const paxInput = document.getElementById('pax');
    const notesInput = document.getElementById('notes');
    const submitBtn = document.getElementById('submitBtn');
    const messageDiv = document.getElementById('message');
    const operatingHoursMessage = document.getElementById('operatingHoursMessage');

    // Horario de operación para tomar reservas (7 AM a 4 PM)
    const OPENING_HOUR = 0;
    const CLOSING_HOUR = 4; // 4 PM

    // Función para mostrar mensajes
    function showMessage(msg, type) {
        messageDiv.textContent = msg;
        messageDiv.className = `message ${type}`;
        setTimeout(() => {
            messageDiv.textContent = '';
            messageDiv.className = 'message';
        }, 5000); // El mensaje desaparece después de 5 segundos
    }

    // --- Validar Horario de Operación ---
    function checkOperatingHours() {
        const now = new Date();
        const currentHour = now.getHours();

        if (currentHour < OPENING_HOUR || currentHour >= CLOSING_HOUR) {
            operatingHoursMessage.textContent = `Las reservas solo se aceptan entre las ${OPENING_HOUR} AM y las ${CLOSING_HOUR} PM. Actualmente son las ${now.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}.`;
            operatingHoursMessage.className = 'message info';
            reservationForm.style.pointerEvents = 'none'; // Deshabilita el formulario
            reservationForm.style.opacity = '0.6';
            submitBtn.disabled = true;
            return false;
        } else {
            operatingHoursMessage.textContent = `Puedes tomar reservas. Horario de operación: ${OPENING_HOUR} AM - ${CLOSING_HOUR} PM.`;
            operatingHoursMessage.className = 'message success';
            reservationForm.style.pointerEvents = 'auto';
            reservationForm.style.opacity = '1';
            submitBtn.disabled = false;
            return true;
        }
    }

    checkOperatingHours();
    setInterval(checkOperatingHours, 60 * 1000); // Actualiza cada minuto

    // --- Cargar Restaurantes desde Realtime Database ---
    async function loadRestaurants() {
        try {
            const restaurantsRef = ref(db, 'restaurants');
            const snapshot = await get(restaurantsRef); // Obtener los datos una vez

            restaurantSelect.innerHTML = '<option value="">Selecciona un restaurante</option>';
            if (snapshot.exists()) {
                const restaurants = snapshot.val();
                for (const id in restaurants) {
                    const restaurant = restaurants[id];
                    if (!restaurant.closed) {
                        const option = document.createElement('option');
                        option.value = id; // Usar el ID (key) como valor
                        option.textContent = restaurant.name;
                        restaurantSelect.appendChild(option);
                    }
                }
            }
            console.log("Restaurantes cargados.");
        } catch (error) {
            console.error("Error al cargar restaurantes: ", error);
            showMessage('Error al cargar la lista de restaurantes. Intenta de nuevo.', 'error');
        }
    }

    // --- Cargar Horarios basados en el Restaurante Seleccionado ---
    restaurantSelect.addEventListener('change', async () => {
        const selectedRestaurantId = restaurantSelect.value;
        timeSlotSelect.innerHTML = '<option value="">Selecciona un horario</option>';
        timeSlotSelect.disabled = true;

        if (selectedRestaurantId) {
            try {
                const restaurantRef = ref(db, `restaurants/${selectedRestaurantId}`);
                const snapshot = await get(restaurantRef);

                if (snapshot.exists()) {
                    const restaurantData = snapshot.val();
                    if (restaurantData.schedules && restaurantData.schedules.length > 0) {
                        restaurantData.schedules.forEach(schedule => {
                            const option = document.createElement('option');
                            option.value = schedule.time;
                            option.textContent = `${schedule.time} (${schedule.capacity} pax)`;
                            timeSlotSelect.appendChild(option);
                        });
                        timeSlotSelect.disabled = false;
                    } else {
                        showMessage('No hay horarios disponibles para este restaurante.', 'info');
                    }
                } else {
                    showMessage('Restaurante no encontrado.', 'error');
                }
            } catch (error) {
                console.error("Error al cargar horarios: ", error);
                showMessage('Error al cargar los horarios del restaurante. Intenta de nuevo.', 'error');
            }
        }
    });

    // --- Enviar Formulario de Reserva ---
    reservationForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!checkOperatingHours()) {
            showMessage('No se pueden tomar reservas fuera del horario de operación.', 'error');
            return;
        }

        submitBtn.disabled = true;
        showMessage('Procesando reserva...', 'info');

        const roomNumber = roomNumberInput.value.trim();
        const guestName = guestNameInput.value.trim();
        const restaurantId = restaurantSelect.value;
        const restaurantName = restaurantSelect.options[restaurantSelect.selectedIndex].text.split(' (')[0];
        const timeSlot = timeSlotSelect.value;
        const pax = parseInt(paxInput.value);
        const notes = notesInput.value.trim();

        if (!roomNumber || !guestName || !restaurantId || !timeSlot || isNaN(pax) || pax <= 0) {
            showMessage('Por favor, completa todos los campos requeridos.', 'error');
            submitBtn.disabled = false;
            return;
        }

        try {
            const restaurantRef = ref(db, `restaurants/${restaurantId}`);
            const restaurantSnapshot = await get(restaurantRef);

            if (!restaurantSnapshot.exists() || restaurantSnapshot.val().closed) {
                showMessage('El restaurante seleccionado no es válido o está cerrado.', 'error');
                submitBtn.disabled = false;
                return;
            }

            const restaurantData = restaurantSnapshot.val();
            const selectedSchedule = restaurantData.schedules.find(s => s.time === timeSlot);

            if (!selectedSchedule) {
                showMessage('Horario no válido para el restaurante seleccionado.', 'error');
                submitBtn.disabled = false;
                return;
            }

            const maxCapacity = selectedSchedule.capacity;

            // Obtener las reservas existentes para este restaurante, horario y fecha
            const today = new Date().toISOString().slice(0, 10);
            const reservationsRef = ref(db, 'reservations');
            const reservationsSnapshot = await get(reservationsRef);

            let currentPaxBooked = 0;
            if (reservationsSnapshot.exists()) {
                const allReservations = reservationsSnapshot.val();
                for (const key in allReservations) {
                    const res = allReservations[key];
                    if (res.restaurantId === restaurantId &&
                        res.timeSlot === timeSlot &&
                        res.reservationDate === today &&
                        (res.status === 'confirmed' || res.status === 'printed')) {
                        currentPaxBooked += res.pax;
                    }
                }
            }

            if (currentPaxBooked + pax > maxCapacity) {
                showMessage(`Lo sentimos, solo quedan ${maxCapacity - currentPaxBooked} cupos para este horario. Tu reserva de ${pax} personas excede la capacidad.`, 'error');
                submitBtn.disabled = false;
                return;
            }

            // Si hay cupos, procede a guardar la reserva
            const newReservation = {
                roomNumber: roomNumber,
                guestName: guestName,
                restaurantId: restaurantId,
                restaurantName: restaurantName,
                timeSlot: timeSlot,
                pax: pax,
                notes: notes,
                reservationDate: today,
                timestampCreated: new Date().getTime(), // Usar timestamp Unix para Realtime Database
                status: 'confirmed'
            };

            // Push para generar una nueva clave única
            const newReservationRef = push(reservationsRef);
            await set(newReservationRef, newReservation);

            showMessage('¡Reserva confirmada con éxito!', 'success');
            reservationForm.reset();
            timeSlotSelect.disabled = true;
            roomNumberInput.focus();

        } catch (error) {
            console.error("Error al añadir la reserva: ", error);
            showMessage('Error al procesar la reserva. Intenta de nuevo.', 'error');
        } finally {
            submitBtn.disabled = false;
        }
    });

    loadRestaurants();
});
