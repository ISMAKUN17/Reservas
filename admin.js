// admin.js
import { db, ref, get, onValue, update, remove } from './firebase-config.js'; // Importa las funciones de Realtime Database

document.addEventListener('DOMContentLoaded', async () => {
    const filterDateInput = document.getElementById('filterDate');
    const filterRestaurantSelect = document.getElementById('filterRestaurant');
    const filterStatusSelect = document.getElementById('filterStatus');
    const applyFiltersBtn = document.getElementById('applyFiltersBtn');
    const resetFiltersBtn = document.getElementById('resetFiltersBtn');
    const reservationsTableBody = document.querySelector('#reservationsTable tbody');
    const noReservationsMessage = document.getElementById('noReservationsMessage');
    const occupancySummaryDiv = document.getElementById('occupancySummary');
    const summaryDateSpan = document.getElementById('summaryDate');
    const printDailyReservationsBtn = document.getElementById('printDailyReservationsBtn');

    let allReservations = []; // Almacena todas las reservas cargadas
    let allRestaurants = []; // Almacena la configuración de todos los restaurantes

    let reservationsListener = null; // Para guardar la referencia del listener de Realtime Database

    // --- Cargar Restaurantes para el Filtro ---
    async function loadRestaurantsForFilter() {
        try {
            const restaurantsRef = ref(db, 'restaurants');
            const snapshot = await get(restaurantsRef);

            filterRestaurantSelect.innerHTML = '<option value="">Todos los Restaurantes</option>';
            allRestaurants = [];
            if (snapshot.exists()) {
                const restaurants = snapshot.val();
                for (const id in restaurants) {
                    const restaurant = { id: id, ...restaurants[id] };
                    allRestaurants.push(restaurant);
                    const option = document.createElement('option');
                    option.value = id;
                    option.textContent = restaurant.name;
                    filterRestaurantSelect.appendChild(option);
                }
            }
            console.log("Restaurantes cargados para el filtro.");
        } catch (error) {
            console.error("Error al cargar restaurantes para el filtro: ", error);
        }
    }

    // --- Cargar y Mostrar Reservas (con listener en tiempo real) ---
    function loadAndDisplayReservations() {
        // Si ya hay un listener activo, desactívalo antes de crear uno nuevo
        if (reservationsListener) {
            reservationsListener(); // Llama a la función de cancelación del listener
        }

        const selectedDate = filterDateInput.value || new Date().toISOString().slice(0, 10);
        const selectedRestaurantId = filterRestaurantSelect.value;
        const selectedStatus = filterStatusSelect.value;

        summaryDateSpan.textContent = new Date(selectedDate).toLocaleDateString('es-DO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        const reservationsRef = ref(db, 'reservations');

        // onValue es el listener para Realtime Database
        reservationsListener = onValue(reservationsRef, (snapshot) => {
            allReservations = [];
            reservationsTableBody.innerHTML = ''; // Limpiar la tabla

            if (!snapshot.exists()) {
                noReservationsMessage.style.display = 'block';
                reservationsTable.style.display = 'none';
                occupancySummaryDiv.style.display = 'none';
                return;
            }

            const allRawReservations = snapshot.val();
            let filteredAndSortedReservations = [];

            // Filtrar y ordenar manualmente
            for (const key in allRawReservations) {
                const reservation = { id: key, ...allRawReservations[key] };

                const matchesDate = reservation.reservationDate === selectedDate;
                const matchesRestaurant = !selectedRestaurantId || reservation.restaurantId === selectedRestaurantId;
                const matchesStatus = !selectedStatus || reservation.status === selectedStatus;

                if (matchesDate && matchesRestaurant && matchesStatus) {
                    filteredAndSortedReservations.push(reservation);
                }
            }

            // Realtime Database no tiene ordenación compleja como Firestore,
            // así que ordenamos manualmente por timestampCreated
            filteredAndSortedReservations.sort((a, b) => a.timestampCreated - b.timestampCreated);


            if (filteredAndSortedReservations.length === 0) {
                noReservationsMessage.style.display = 'block';
                reservationsTable.style.display = 'none';
                occupancySummaryDiv.style.display = 'none';
                return;
            }

            noReservationsMessage.style.display = 'none';
            reservationsTable.style.display = 'table';
            occupancySummaryDiv.style.display = 'block';

            filteredAndSortedReservations.forEach(reservation => {
                const row = reservationsTableBody.insertRow();
                row.insertCell().textContent = reservation.roomNumber;
                row.insertCell().textContent = reservation.guestName;
                row.insertCell().textContent = reservation.restaurantName;
                row.insertCell().textContent = reservation.timeSlot;
                row.insertCell().textContent = reservation.pax;
                row.insertCell().textContent = reservation.notes || '-';
                row.insertCell().textContent = reservation.reservationDate;
                row.insertCell().textContent = reservation.status;

                const actionsCell = row.insertCell();
                actionsCell.classList.add('actions');

                const editButton = document.createElement('button');
                editButton.textContent = 'Editar';
                editButton.classList.add('btn', 'warning');
                editButton.onclick = () => editReservation(reservation.id);
                actionsCell.appendChild(editButton);

                const deleteButton = document.createElement('button');
                deleteButton.textContent = 'Cancelar';
                deleteButton.classList.add('btn', 'danger');
                deleteButton.onclick = () => cancelReservation(reservation.id, reservation.guestName);
                actionsCell.appendChild(deleteButton);

                if (reservation.status !== 'printed' && reservation.status !== 'cancelled') {
                    const printMarkButton = document.createElement('button');
                    printMarkButton.textContent = 'Marcar Impresa';
                    printMarkButton.classList.add('btn', 'success');
                    printMarkButton.onclick = () => markAsPrinted(reservation.id);
                    actionsCell.appendChild(printMarkButton);
                }
            });

            // Actualiza el resumen con los datos filtrados y ordenados
            updateOccupancySummary(filteredAndSortedReservations, allRestaurants, selectedDate);
        }, (error) => {
            console.error("Error al cargar reservas en tiempo real: ", error);
        });
    }

    // --- Actualizar Resumen de Ocupación ---
    function updateOccupancySummary(reservations, restaurantsConfig, date) {
        const summaryContent = document.createElement('div');
        summaryContent.innerHTML = '';

        const occupancyData = {};

        restaurantsConfig.forEach(rest => {
            if (!occupancyData[rest.id]) {
                occupancyData[rest.id] = { name: rest.name, schedules: {} };
            }
            if (rest.schedules) {
                rest.schedules.forEach(schedule => {
                    occupancyData[rest.id].schedules[schedule.time] = { booked: 0, capacity: schedule.capacity };
                });
            }
        });

        reservations.forEach(res => {
            if (res.status === 'confirmed' || res.status === 'printed') {
                if (occupancyData[res.restaurantId] && occupancyData[res.restaurantId].schedules && occupancyData[res.restaurantId].schedules[res.timeSlot]) {
                    occupancyData[res.restaurantId].schedules[res.timeSlot].booked += res.pax;
                }
            }
        });

        for (const restId in occupancyData) {
            const rest = occupancyData[restId];
            const restDiv = document.createElement('div');
            restDiv.innerHTML = `<h3>${rest.name}</h3>`;
            let hasSchedules = false;
            const sortedSchedules = Object.keys(rest.schedules).sort((a, b) => {
                // Función de comparación mejorada para horarios (ej. "6:00PM" vs "9:00AM")
                const parseTime = (timeStr) => {
                    let [hour, minute] = timeStr.slice(0, -2).split(':').map(Number);
                    const ampm = timeStr.slice(-2);
                    if (ampm === 'PM' && hour !== 12) hour += 12;
                    if (ampm === 'AM' && hour === 12) hour = 0; // 12 AM (medianoche) es 0
                    return hour * 60 + minute;
                };
                return parseTime(a) - parseTime(b);
            });

            sortedSchedules.forEach(time => {
                const schedule = rest.schedules[time];
                restDiv.innerHTML += `<p>${time}: ${schedule.booked} / ${schedule.capacity} pax</p>`;
                hasSchedules = true;
            });
            if (hasSchedules) {
                summaryContent.appendChild(restDiv);
            }
        }
        occupancySummaryDiv.innerHTML = '<h2>Resumen de Ocupación para <span id="summaryDateTop"></span></h2>';
        document.getElementById('summaryDateTop').textContent = new Date(date).toLocaleDateString('es-DO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        occupancySummaryDiv.appendChild(summaryContent);
    }


    // --- Acciones de Reservas ---
    async function editReservation(id) {
        console.log('Editar reserva:', id);
        alert('Funcionalidad de edición aún no implementada. ID de reserva: ' + id);
        // Para editar en Realtime Database, usarías 'update(ref(db, `reservations/${id}`), { nuevosDatos })'
    }

    async function cancelReservation(id, guestName) {
        if (confirm(`¿Estás seguro de que quieres CANCELAR la reserva de ${guestName}? Esta acción es irreversible.`)) {
            try {
                const reservationRef = ref(db, `reservations/${id}`);
                await update(reservationRef, { status: 'cancelled' }); // Solo actualiza el estado
                alert('Reserva cancelada con éxito.');
                // loadAndDisplayReservations() no es necesario aquí gracias al onValue listener
            } catch (error) {
                console.error('Error al cancelar la reserva:', error);
                alert('Error al cancelar la reserva.');
            }
        }
    }

    async function markAsPrinted(id) {
        if (confirm('¿Marcar esta reserva como IMPRESA? Esto indicará que ya se pasó al restaurante.')) {
            try {
                const reservationRef = ref(db, `reservations/${id}`);
                await update(reservationRef, { status: 'printed' });
                alert('Reserva marcada como impresa.');
                // loadAndDisplayReservations() no es necesario aquí gracias al onValue listener
            } catch (error) {
                console.error('Error al marcar como impresa:', error);
                alert('Error al marcar la reserva como impresa.');
            }
        }
    }

    // --- Botones de Filtro ---
    applyFiltersBtn.addEventListener('click', loadAndDisplayReservations);
    resetFiltersBtn.addEventListener('click', () => {
        filterDateInput.value = new Date().toISOString().slice(0, 10);
        filterRestaurantSelect.value = '';
        filterStatusSelect.value = '';
        loadAndDisplayReservations();
    });

    // --- Botón de Imprimir Reservas del Día ---
    printDailyReservationsBtn.addEventListener('click', () => {
        const selectedDate = filterDateInput.value || new Date().toISOString().slice(0, 10);
        // Obtener las reservas que actualmente se muestran en la tabla (ya filtradas y ordenadas por el listener)
        const visibleReservations = [];
        const rows = reservationsTableBody.querySelectorAll('tr');
        rows.forEach(row => {
            // Reconstruir el objeto de reserva a partir de las celdas de la tabla
            const cells = row.querySelectorAll('td');
            if (cells.length > 0) { // Asegurarse de que no sea la fila de "no hay reservas"
                visibleReservations.push({
                    roomNumber: cells[0].textContent,
                    guestName: cells[1].textContent,
                    restaurantName: cells[2].textContent,
                    timeSlot: cells[3].textContent,
                    pax: parseInt(cells[4].textContent),
                    notes: cells[5].textContent === '-' ? '' : cells[5].textContent,
                    status: cells[7].textContent
                });
            }
        });

        // Filtrar solo las confirmadas e impresas para la impresión
        const reservationsToPrint = visibleReservations.filter(res => res.status === 'confirmed' || res.status === 'printed');

        if (reservationsToPrint.length === 0) {
            alert('No hay reservas confirmadas o impresas para imprimir en esta fecha con los filtros actuales.');
            return;
        }

        let printContent = `<h1>Reservas del Día: ${new Date(selectedDate).toLocaleDateString('es-DO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h1>\n\n`;

        reservationsToPrint.forEach(res => {
            printContent += `${res.roomNumber} - ${res.guestName} - ${res.restaurantName} - ${res.timeSlot} - ${res.pax}pax`;
            if (res.notes) {
                printContent += ` - Notas: ${res.notes}`;
            }
            printContent += '\n';
        });

        const printWindow = window.open('', '_blank');
        printWindow.document.write('<!DOCTYPE html><html><head><title>Imprimir Reservas</title><style>');
        printWindow.document.write(`
            body { font-family: 'Inter', sans-serif; margin: 20px; font-size: 12pt; }
            h1 { text-align: left; margin-bottom: 20px; font-size: 1.5em; }
            pre { font-family: 'Inter', monospace; white-space: pre-wrap; word-wrap: break-word; }
        `);
        printWindow.document.write('</style></head><body>');
        printWindow.document.write('<pre>');
        printWindow.document.write(printContent);
        printWindow.document.write('</pre>');
        printWindow.document.close();
        printWindow.print();
    });

    // --- Inicialización ---
    filterDateInput.value = new Date().toISOString().slice(0, 10);
    await loadRestaurantsForFilter();
    loadAndDisplayReservations(); // Inicia el listener de reservas
});
