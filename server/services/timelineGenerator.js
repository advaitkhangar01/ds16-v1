// server/services/timelineGenerator.js
// Construction activity generation engine based on building configuration and verified civil engineering sequencing
// Organized strictly under the 5 Main Indian Construction Sections:
// 1. Site Preparation
// 2. RCC Work
// 3. Masonry Work
// 4. Polishing Work
// 5. Additional Work

/**
 * Format date to YYYY-MM-DD using local calendar parts to prevent timezone offsets
 * @param {Date|string} d 
 * @returns {string|null}
 */
function formatDateStr(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.split('T')[0];
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse date string YYYY-MM-DD into a local Date without UTC-midnight shifts
 * @param {string|Date} dateInput 
 * @returns {Date}
 */
function parseDateStr(dateInput) {
  if (!dateInput) return new Date();
  if (dateInput instanceof Date) return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate());
  const cleanStr = String(dateInput).split('T')[0];
  const parts = cleanStr.split('-').map(Number);
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  return new Date();
}

/**
 * Add exact calendar days to a date (handles leap years, month-ends, and year-ends)
 * @param {string|Date} dateInput 
 * @param {number} days 
 * @returns {Date}
 */
function addCalendarDays(dateInput, days) {
  const d = parseDateStr(dateInput);
  d.setDate(d.getDate() + Number(days));
  return d;
}

/**
 * Generate standard construction schedule activities
 * @param {Object} config Building configuration and duration settings
 * @returns {Array} List of draft activities with proposed dates, dependencies, floor assignments, and section groupings
 */
function generateDraftActivities(config = {}) {
  const N = Math.max(1, parseInt(config.floors_above_ground, 10) || 4);
  const hasTankSlab = config.has_terrace_tank_slab !== false;
  const startDateStr = config.start_date || formatDateStr(new Date());

  // Duration configurations with authoritative defaults
  const customDurations = config.custom_durations || {};

  // 1. Site Preparation Durations (Default combined: 28 days)
  const siteClearingDuration = Math.max(1, parseInt(customDurations.site_clearing_days, 10) || 14);
  const excavationDuration = Math.max(1, parseInt(customDurations.excavation_days, 10) || 14);

  // 2. Plinth Work Durations
  const plinthBeamDuration = Math.max(1, parseInt(customDurations.plinth_beam_days, 10) || 10);
  const plinthSlabDuration = Math.max(1, parseInt(customDurations.plinth_slab_days, 10) || 7);

  // 3. Column Work Durations (7 + 7 + 7 = 21 days total)
  const colBindingDuration = Math.max(1, parseInt(customDurations.col_binding_days, 10) || 7);
  const colShutteringDuration = Math.max(1, parseInt(customDurations.col_shuttering_days, 10) || 7);
  const colCastingDuration = Math.max(1, parseInt(customDurations.col_casting_days, 10) || 7);

  // 4. Masonry Work Durations per floor (Default combined: 21 days)
  const brickworkDuration = Math.max(1, parseInt(customDurations.brickwork_days, 10) || 7);
  const elecPipingDuration = Math.max(1, parseInt(customDurations.electrical_piping_days, 10) || 4);
  const plumbingDuration = Math.max(1, parseInt(customDurations.plumbing_days, 10) || 4);
  const plasteringDuration = Math.max(1, parseInt(customDurations.plastering_days, 10) || 6);

  // 5. Polishing Work Durations per floor
  const tileFittingDuration = Math.max(1, parseInt(customDurations.tile_fitting_days, 10) || 10);
  const paintingDuration = Math.max(1, parseInt(customDurations.painting_days, 10) || 10);
  const falseCeilingDuration = Math.max(1, parseInt(customDurations.false_ceiling_days, 10) || 7);
  const doorWorkDuration = Math.max(1, parseInt(customDurations.door_work_days, 10) || 5);
  const windowWorkDuration = Math.max(1, parseInt(customDurations.window_work_days, 10) || 5);

  // Polishing Mode: 'floor_wise' (Mode A) or 'after_rcc' (Mode B)
  const polishingMode = config.polishing_mode === 'after_rcc' ? 'after_rcc' : 'floor_wise';

  // Configurable Basements & Parking Levels
  let basementCount = parseInt(config.basement_count, 10);
  if (isNaN(basementCount)) {
    const pFloors = Array.isArray(config.parking_floors) ? config.parking_floors : [];
    basementCount = pFloors.filter(f => f.type === 'basement_1' || f.type === 'basement_2' || f.type?.includes?.('basement')).length;
  }
  basementCount = Math.max(0, basementCount);

  let upperParkingCount = parseInt(config.upper_parking_count, 10);
  if (isNaN(upperParkingCount)) {
    const pFloors = Array.isArray(config.parking_floors) ? config.parking_floors : [];
    upperParkingCount = pFloors.some(f => f.type === 'upper_parking') ? 1 : 0;
  }
  upperParkingCount = Math.max(0, upperParkingCount);

  const additionalWorkConfig = config.additional_work_config || {
    elevation: false,
    lift: config.has_lift !== false,
    fire: false,
    solar: false
  };

  const tasks = [];
  let taskOrder = 1;

  function pushTask(tDef) {
    const t = {
      ...tDef,
      forecast_start_date: tDef.planned_start_date,
      forecast_finish_date: tDef.planned_finish_date,
      is_milestone: Boolean(tDef.is_milestone),
      metadata: tDef.metadata || {}
    };
    tasks.push(t);
    return t;
  }

  // =========================================================================
  // SECTION 1: SITE PREPARATION (Combined default 28 days)
  // =========================================================================
  let currentDate = parseDateStr(startDateStr);

  // 1.1 Site Demarcation, Clearing & Leveling
  const siteClearStart = currentDate;
  const siteClearFinish = addCalendarDays(siteClearStart, siteClearingDuration - 1);
  const tSiteClear = pushTask({
    temp_id: `draft-${taskOrder}`,
    task_name: 'Site Demarcation, Clearing & Leveling',
    section_name: 'Site Preparation',
    category: 'Site Preparation',
    construction_stage: 'Site Preparation',
    floor_zone: 'Site Level',
    duration_days: siteClearingDuration,
    order_index: taskOrder++,
    predecessors: [],
    planned_start_date: formatDateStr(siteClearStart),
    planned_finish_date: formatDateStr(siteClearFinish)
  });

  // 1.2 Earthwork Excavation for Foundations & Footings
  const excavStart = addCalendarDays(tSiteClear.planned_finish_date, 1);
  const excavFinish = addCalendarDays(excavStart, excavationDuration - 1);
  const tExcavation = pushTask({
    temp_id: `draft-${taskOrder}`,
    task_name: 'Earthwork Excavation for Foundations & Footings',
    section_name: 'Site Preparation',
    category: 'Site Preparation',
    construction_stage: 'Site Preparation',
    floor_zone: 'Foundation Level',
    duration_days: excavationDuration,
    order_index: taskOrder++,
    predecessors: [{ predecessor_id: tSiteClear.temp_id, type: 'FS', lag: 0 }],
    planned_start_date: formatDateStr(excavStart),
    planned_finish_date: formatDateStr(excavFinish)
  });

  let prevSubstructureTask = tExcavation;

  // Optional Basements Substructure (if configured)
  if (basementCount > 0) {
    for (let b = basementCount; b >= 1; b--) {
      const bZone = `Basement ${b}`;
      const bRetDuration = 14;
      const bRetStart = addCalendarDays(prevSubstructureTask.planned_finish_date, 1);
      const bRetFinish = addCalendarDays(bRetStart, bRetDuration - 1);
      const tBRet = pushTask({
        temp_id: `draft-${taskOrder}`,
        task_name: `${bZone} — RCC Retaining Wall & Raft Casting`,
        section_name: 'RCC Work',
        category: 'Substructure RCC',
        construction_stage: 'RCC Work',
        floor_zone: bZone,
        duration_days: bRetDuration,
        order_index: taskOrder++,
        predecessors: [{ predecessor_id: prevSubstructureTask.temp_id, type: 'FS', lag: 0 }],
        planned_start_date: formatDateStr(bRetStart),
        planned_finish_date: formatDateStr(bRetFinish)
      });

      const bSlabDuration = 14;
      const bSlabStart = addCalendarDays(tBRet.planned_finish_date, 1);
      const bSlabFinish = addCalendarDays(bSlabStart, bSlabDuration - 1);
      const tBSlab = pushTask({
        temp_id: `draft-${taskOrder}`,
        task_name: `${bZone} — Columns & Suspended Slab Casting`,
        section_name: 'RCC Work',
        category: 'Substructure RCC',
        construction_stage: 'RCC Work',
        floor_zone: bZone,
        duration_days: bSlabDuration,
        order_index: taskOrder++,
        predecessors: [{ predecessor_id: tBRet.temp_id, type: 'FS', lag: 0 }],
        planned_start_date: formatDateStr(bSlabStart),
        planned_finish_date: formatDateStr(bSlabFinish)
      });
      prevSubstructureTask = tBSlab;
    }
  }

  // =========================================================================
  // SECTION 2: RCC WORK
  // =========================================================================

  // 2.1 Plinth Work
  // 1. Plinth Beam
  const plinthBeamStart = addCalendarDays(prevSubstructureTask.planned_finish_date, 1);
  const plinthBeamFinish = addCalendarDays(plinthBeamStart, plinthBeamDuration - 1);
  const tPlinthBeam = pushTask({
    temp_id: `draft-${taskOrder}`,
    task_name: 'Plinth Beam',
    section_name: 'RCC Work',
    category: 'Plinth Work',
    construction_stage: 'RCC Work',
    floor_zone: 'Plinth Level',
    duration_days: plinthBeamDuration,
    order_index: taskOrder++,
    predecessors: [{ predecessor_id: prevSubstructureTask.temp_id, type: 'FS', lag: 0 }],
    planned_start_date: formatDateStr(plinthBeamStart),
    planned_finish_date: formatDateStr(plinthBeamFinish)
  });

  // 2. Plinth Slab
  const plinthSlabStart = addCalendarDays(tPlinthBeam.planned_finish_date, 1);
  const plinthSlabFinish = addCalendarDays(plinthSlabStart, plinthSlabDuration - 1);
  const tPlinthSlab = pushTask({
    temp_id: `draft-${taskOrder}`,
    task_name: 'Plinth Slab',
    section_name: 'RCC Work',
    category: 'Plinth Work',
    construction_stage: 'RCC Work',
    floor_zone: 'Plinth Level',
    duration_days: plinthSlabDuration,
    order_index: taskOrder++,
    predecessors: [{ predecessor_id: tPlinthBeam.temp_id, type: 'FS', lag: 0 }],
    planned_start_date: formatDateStr(plinthSlabStart),
    planned_finish_date: formatDateStr(plinthSlabFinish)
  });

  let prevRccTask = tPlinthSlab;
  const slabCastingTasks = [];
  let tThirdFloorSlabCasting = null;

  // Helper function to build ordinal floor naming
  const getFloorName = (fIdx) => {
    if (fIdx === 0) return 'Ground Floor';
    if (fIdx === 1) return 'First Floor';
    if (fIdx === 2) return 'Second Floor';
    if (fIdx === 3) return 'Third Floor';
    if (fIdx === 4) return 'Fourth Floor';
    return `${fIdx}th Floor`;
  };

  // Optional Upper-Floor Parking (Podiums)
  if (upperParkingCount > 0) {
    for (let p = 1; p <= upperParkingCount; p++) {
      const pZone = `Podium Parking ${p}`;
      // Columns (21d)
      const colBindStart = addCalendarDays(prevRccTask.planned_finish_date, 1);
      const colBindFinish = addCalendarDays(colBindStart, colBindingDuration - 1);
      const tColBind = pushTask({
        temp_id: `draft-${taskOrder}`,
        task_name: `${pZone} Column Steel Binding`,
        section_name: 'RCC Work',
        category: 'RCC Columns',
        construction_stage: 'RCC Work',
        floor_zone: pZone,
        duration_days: colBindingDuration,
        order_index: taskOrder++,
        predecessors: [{ predecessor_id: prevRccTask.temp_id, type: 'FS', lag: 0 }],
        planned_start_date: formatDateStr(colBindStart),
        planned_finish_date: formatDateStr(colBindFinish)
      });

      const colShutStart = addCalendarDays(tColBind.planned_finish_date, 1);
      const colShutFinish = addCalendarDays(colShutStart, colShutteringDuration - 1);
      const tColShut = pushTask({
        temp_id: `draft-${taskOrder}`,
        task_name: `${pZone} Column Steel Shuttering`,
        section_name: 'RCC Work',
        category: 'RCC Columns',
        construction_stage: 'RCC Work',
        floor_zone: pZone,
        duration_days: colShutteringDuration,
        order_index: taskOrder++,
        predecessors: [{ predecessor_id: tColBind.temp_id, type: 'FS', lag: 0 }],
        planned_start_date: formatDateStr(colShutStart),
        planned_finish_date: formatDateStr(colShutFinish)
      });

      const colCastStart = addCalendarDays(tColShut.planned_finish_date, 1);
      const colCastFinish = addCalendarDays(colCastStart, colCastingDuration - 1);
      const tColCast = pushTask({
        temp_id: `draft-${taskOrder}`,
        task_name: `${pZone} Column Casting`,
        section_name: 'RCC Work',
        category: 'RCC Columns',
        construction_stage: 'RCC Work',
        floor_zone: pZone,
        duration_days: colCastingDuration,
        order_index: taskOrder++,
        predecessors: [{ predecessor_id: tColShut.temp_id, type: 'FS', lag: 0 }],
        planned_start_date: formatDateStr(colCastStart),
        planned_finish_date: formatDateStr(colCastFinish)
      });

      // Slab 1-day combined tasks
      const slabDate = addCalendarDays(tColCast.planned_finish_date, 1);
      const slabDateStr = formatDateStr(slabDate);

      const tSlabShut = pushTask({
        temp_id: `draft-${taskOrder}`,
        task_name: `${pZone} Slab Steel Shuttering`,
        section_name: 'RCC Work',
        category: 'RCC Slabs',
        construction_stage: 'RCC Work',
        floor_zone: pZone,
        duration_days: 1,
        order_index: taskOrder++,
        predecessors: [{ predecessor_id: tColCast.temp_id, type: 'FS', lag: 0 }],
        planned_start_date: slabDateStr,
        planned_finish_date: slabDateStr
      });

      const tSlabBind = pushTask({
        temp_id: `draft-${taskOrder}`,
        task_name: `${pZone} Slab Steel Binding`,
        section_name: 'RCC Work',
        category: 'RCC Slabs',
        construction_stage: 'RCC Work',
        floor_zone: pZone,
        duration_days: 1,
        order_index: taskOrder++,
        predecessors: [{ predecessor_id: tSlabShut.temp_id, type: 'SS', lag: 0 }],
        planned_start_date: slabDateStr,
        planned_finish_date: slabDateStr
      });

      const tSlabCast = pushTask({
        temp_id: `draft-${taskOrder}`,
        task_name: `${pZone} Slab Casting`,
        section_name: 'RCC Work',
        category: 'RCC Slabs',
        construction_stage: 'RCC Work',
        floor_zone: pZone,
        duration_days: 1,
        order_index: taskOrder++,
        predecessors: [{ predecessor_id: tSlabBind.temp_id, type: 'SS', lag: 0 }],
        planned_start_date: slabDateStr,
        planned_finish_date: slabDateStr
      });

      prevRccTask = tSlabCast;
      slabCastingTasks.push(tSlabCast);
    }
  }

  // 2.2 Standard Floor RCC Cycles (Ground Floor up to Floor N)
  // For floor f (0 = Ground Floor):
  // Column activities belong to floor f
  // Next slab activities belong to floor f+1 (e.g. Ground columns -> First Floor Slab)
  for (let f = 0; f < N; f++) {
    const colFloorName = getFloorName(f);
    const isTopHabitable = (f === N - 1);
    const nextSlabName = isTopHabitable ? 'Terrace Floor Slab' : `${getFloorName(f + 1)} Slab`;

    // 1. Column Steel Binding (7 days)
    const colBindStart = addCalendarDays(prevRccTask.planned_finish_date, 1);
    const colBindFinish = addCalendarDays(colBindStart, colBindingDuration - 1);
    const tColBind = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: `${colFloorName} Column Steel Binding`,
      section_name: 'RCC Work',
      category: 'RCC Columns',
      construction_stage: 'RCC Work',
      floor_zone: colFloorName,
      duration_days: colBindingDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: prevRccTask.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(colBindStart),
      planned_finish_date: formatDateStr(colBindFinish)
    });

    // 2. Column Steel Shuttering (7 days)
    const colShutStart = addCalendarDays(tColBind.planned_finish_date, 1);
    const colShutFinish = addCalendarDays(colShutStart, colShutteringDuration - 1);
    const tColShut = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: `${colFloorName} Column Steel Shuttering`,
      section_name: 'RCC Work',
      category: 'RCC Columns',
      construction_stage: 'RCC Work',
      floor_zone: colFloorName,
      duration_days: colShutteringDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tColBind.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(colShutStart),
      planned_finish_date: formatDateStr(colShutFinish)
    });

    // 3. Column Casting (7 days)
    const colCastStart = addCalendarDays(tColShut.planned_finish_date, 1);
    const colCastFinish = addCalendarDays(colCastStart, colCastingDuration - 1);
    const tColCast = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: `${colFloorName} Column Casting`,
      section_name: 'RCC Work',
      category: 'RCC Columns',
      construction_stage: 'RCC Work',
      floor_zone: colFloorName,
      duration_days: colCastingDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tColShut.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(colCastStart),
      planned_finish_date: formatDateStr(colCastFinish)
    });

    // 4, 5, 6: Slab Steel Shuttering + Binding + Casting (Exact Same 1 Day)
    const slabDay = addCalendarDays(tColCast.planned_finish_date, 1);
    const slabDayStr = formatDateStr(slabDay);

    const tSlabShut = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: `${nextSlabName} Steel Shuttering`,
      section_name: 'RCC Work',
      category: 'RCC Slabs',
      construction_stage: 'RCC Work',
      floor_zone: isTopHabitable ? 'Terrace Level' : getFloorName(f + 1),
      duration_days: 1,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tColCast.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: slabDayStr,
      planned_finish_date: slabDayStr
    });

    const tSlabBind = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: `${nextSlabName} Steel Binding`,
      section_name: 'RCC Work',
      category: 'RCC Slabs',
      construction_stage: 'RCC Work',
      floor_zone: isTopHabitable ? 'Terrace Level' : getFloorName(f + 1),
      duration_days: 1,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tSlabShut.temp_id, type: 'SS', lag: 0 }],
      planned_start_date: slabDayStr,
      planned_finish_date: slabDayStr
    });

    const isThirdFloorSlab = (f === 2); // Ground(f=0)->1st Slab; 1st(f=1)->2nd Slab; 2nd(f=2)->3rd Slab!

    const tSlabCast = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: `${nextSlabName} Casting`,
      section_name: 'RCC Work',
      category: 'RCC Slabs',
      construction_stage: 'RCC Work',
      floor_zone: isTopHabitable ? 'Terrace Level' : getFloorName(f + 1),
      duration_days: 1,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tSlabBind.temp_id, type: 'SS', lag: 0 }],
      planned_start_date: slabDayStr,
      planned_finish_date: slabDayStr,
      is_milestone: isThirdFloorSlab,
      metadata: {
        is_third_floor_slab: isThirdFloorSlab,
        milestone_code: isThirdFloorSlab ? 'SLAB_3RD_FLOOR' : null
      }
    });

    if (isThirdFloorSlab) {
      tThirdFloorSlabCasting = tSlabCast;
    }

    prevRccTask = tSlabCast;
    slabCastingTasks.push(tSlabCast);
  }

  // 2.3 Terrace and Water Tank RCC (if enabled)
  if (hasTankSlab) {
    const colBindStart = addCalendarDays(prevRccTask.planned_finish_date, 1);
    const colBindFinish = addCalendarDays(colBindStart, colBindingDuration - 1);
    const tTankColBind = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: 'Terrace Floor Water Tank Column Steel Binding',
      section_name: 'RCC Work',
      category: 'RCC Columns',
      construction_stage: 'RCC Work',
      floor_zone: 'Terrace Level',
      duration_days: colBindingDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: prevRccTask.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(colBindStart),
      planned_finish_date: formatDateStr(colBindFinish)
    });

    const colShutStart = addCalendarDays(tTankColBind.planned_finish_date, 1);
    const colShutFinish = addCalendarDays(colShutStart, colShutteringDuration - 1);
    const tTankColShut = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: 'Terrace Floor Water Tank Column Steel Shuttering',
      section_name: 'RCC Work',
      category: 'RCC Columns',
      construction_stage: 'RCC Work',
      floor_zone: 'Terrace Level',
      duration_days: colShutteringDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tTankColBind.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(colShutStart),
      planned_finish_date: formatDateStr(colShutFinish)
    });

    const colCastStart = addCalendarDays(tTankColShut.planned_finish_date, 1);
    const colCastFinish = addCalendarDays(colCastStart, colCastingDuration - 1);
    const tTankColCast = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: 'Terrace Floor Water Tank Column Casting',
      section_name: 'RCC Work',
      category: 'RCC Columns',
      construction_stage: 'RCC Work',
      floor_zone: 'Terrace Level',
      duration_days: colCastingDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tTankColShut.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(colCastStart),
      planned_finish_date: formatDateStr(colCastFinish)
    });

    const tankSlabDay = addCalendarDays(tTankColCast.planned_finish_date, 1);
    const tankSlabDayStr = formatDateStr(tankSlabDay);

    const tTankSlabShut = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: 'Water Tank Slab Steel Shuttering',
      section_name: 'RCC Work',
      category: 'RCC Slabs',
      construction_stage: 'RCC Work',
      floor_zone: 'Water Tank',
      duration_days: 1,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tTankColCast.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: tankSlabDayStr,
      planned_finish_date: tankSlabDayStr
    });

    const tTankSlabBind = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: 'Water Tank Slab Steel Binding',
      section_name: 'RCC Work',
      category: 'RCC Slabs',
      construction_stage: 'RCC Work',
      floor_zone: 'Water Tank',
      duration_days: 1,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tTankSlabShut.temp_id, type: 'SS', lag: 0 }],
      planned_start_date: tankSlabDayStr,
      planned_finish_date: tankSlabDayStr
    });

    const tTankSlabCast = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: 'Water Tank Slab Casting',
      section_name: 'RCC Work',
      category: 'RCC Slabs',
      construction_stage: 'RCC Work',
      floor_zone: 'Water Tank',
      duration_days: 1,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tTankSlabBind.temp_id, type: 'SS', lag: 0 }],
      planned_start_date: tankSlabDayStr,
      planned_finish_date: tankSlabDayStr,
      is_milestone: true,
      metadata: { is_rcc_final_milestone: true }
    });

    prevRccTask = tTankSlabCast;
    slabCastingTasks.push(tTankSlabCast);
  }

  const lastRccTask = prevRccTask;

  // =========================================================================
  // SECTION 3: MASONRY WORK (Sequential floor-wise execution, 21d per floor)
  // 4 activities: Brickwork, Electrical Piping, Plumbing, Plastering
  // =========================================================================
  // Commencement Trigger Rule:
  // For buildings with >= 3 floors: wait until 3rd Floor Slab Casting completes -> start next day
  // For buildings with < 3 floors: wait until complete RCC work finishes -> start next day
  let masonryStartRefDate = null;
  let masonryTriggerTask = null;

  if (N >= 3 && tThirdFloorSlabCasting) {
    masonryStartRefDate = addCalendarDays(tThirdFloorSlabCasting.planned_finish_date, 1);
    masonryTriggerTask = tThirdFloorSlabCasting;
  } else {
    masonryStartRefDate = addCalendarDays(lastRccTask.planned_finish_date, 1);
    masonryTriggerTask = lastRccTask;
  }

  let prevFloorMasonryEnd = null;
  const floorPlasteringTasks = {};

  for (let f = 0; f < N; f++) {
    const floorLabel = getFloorName(f);
    let floorStart;

    if (f === 0) {
      floorStart = masonryStartRefDate;
    } else {
      floorStart = addCalendarDays(prevFloorMasonryEnd, 1);
    }

    // 1. Brickwork
    const brickStart = floorStart;
    const brickFinish = addCalendarDays(brickStart, brickworkDuration - 1);
    const tBrick = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: `${floorLabel} Brickwork`,
      section_name: 'Masonry Work',
      category: 'Masonry Work',
      construction_stage: 'Masonry Work',
      floor_zone: floorLabel,
      duration_days: brickworkDuration,
      order_index: taskOrder++,
      predecessors: f === 0 && masonryTriggerTask
        ? [{ predecessor_id: masonryTriggerTask.temp_id, type: 'FS', lag: 1 }]
        : [{ predecessor_id: tasks[tasks.length - 1].temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(brickStart),
      planned_finish_date: formatDateStr(brickFinish),
      metadata: { floor_level: f, is_ground_brickwork: f === 0 }
    });

    // 2. Electrical Piping
    const eleStart = addCalendarDays(tBrick.planned_finish_date, 1);
    const eleFinish = addCalendarDays(eleStart, elecPipingDuration - 1);
    const tElec = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: `${floorLabel} Electrical Piping`,
      section_name: 'Masonry Work',
      category: 'Masonry Work',
      construction_stage: 'Masonry Work',
      floor_zone: floorLabel,
      duration_days: elecPipingDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tBrick.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(eleStart),
      planned_finish_date: formatDateStr(eleFinish),
      metadata: { floor_level: f }
    });

    // 3. Plumbing
    const plumbStart = addCalendarDays(tElec.planned_finish_date, 1);
    const plumbFinish = addCalendarDays(plumbStart, plumbingDuration - 1);
    const tPlumb = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: `${floorLabel} Plumbing`,
      section_name: 'Masonry Work',
      category: 'Masonry Work',
      construction_stage: 'Masonry Work',
      floor_zone: floorLabel,
      duration_days: plumbingDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tElec.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(plumbStart),
      planned_finish_date: formatDateStr(plumbFinish),
      metadata: { floor_level: f }
    });

    // 4. Plastering
    const plastStart = addCalendarDays(tPlumb.planned_finish_date, 1);
    const plastFinish = addCalendarDays(plastStart, plasteringDuration - 1);
    const tPlast = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: `${floorLabel} Plastering`,
      section_name: 'Masonry Work',
      category: 'Masonry Work',
      construction_stage: 'Masonry Work',
      floor_zone: floorLabel,
      duration_days: plasteringDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tPlumb.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(plastStart),
      planned_finish_date: formatDateStr(plastFinish),
      metadata: { floor_level: f }
    });

    floorPlasteringTasks[f] = tPlast;
    prevFloorMasonryEnd = tPlast.planned_finish_date;
  }

  // =========================================================================
  // SECTION 4: POLISHING WORK
  // 5 activities per floor: Tile Fitting, Painting, False Ceiling, Door, Window
  // Mode A (Floor-wise): starts after Plastering on that floor finishes
  // Mode B (After Complete RCC): starts after all RCC work has finished
  // =========================================================================
  for (let f = 0; f < N; f++) {
    const floorLabel = getFloorName(f);
    const floorPlastTask = floorPlasteringTasks[f];

    let polishStart;
    let polishPredecessor;

    if (polishingMode === 'after_rcc') {
      // Must wait until both this floor's plastering AND all RCC work are completed
      const plastEnd = parseDateStr(floorPlastTask.planned_finish_date);
      const rccEnd = parseDateStr(lastRccTask.planned_finish_date);
      const maxEnd = plastEnd > rccEnd ? plastEnd : rccEnd;
      polishStart = addCalendarDays(maxEnd, 1);
      polishPredecessor = plastEnd > rccEnd ? floorPlastTask : lastRccTask;
    } else {
      // Mode A: Floor-wise (immediately follows floor plastering)
      polishStart = addCalendarDays(floorPlastTask.planned_finish_date, 1);
      polishPredecessor = floorPlastTask;
    }

    // 1. Tile Fitting
    const tileStart = polishStart;
    const tileFinish = addCalendarDays(tileStart, tileFittingDuration - 1);
    const tTile = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: `${floorLabel} Tile Fitting`,
      section_name: 'Polishing Work',
      category: 'Polishing Work',
      construction_stage: 'Polishing Work',
      floor_zone: floorLabel,
      duration_days: tileFittingDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: polishPredecessor.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(tileStart),
      planned_finish_date: formatDateStr(tileFinish),
      metadata: { floor_level: f }
    });

    // 2. Painting
    const paintStart = addCalendarDays(tTile.planned_finish_date, 1);
    const paintFinish = addCalendarDays(paintStart, paintingDuration - 1);
    const tPaint = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: `${floorLabel} Painting`,
      section_name: 'Polishing Work',
      category: 'Polishing Work',
      construction_stage: 'Polishing Work',
      floor_zone: floorLabel,
      duration_days: paintingDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tTile.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(paintStart),
      planned_finish_date: formatDateStr(paintFinish),
      metadata: { floor_level: f }
    });

    // 3. False Ceiling Work
    const ceilStart = addCalendarDays(tPaint.planned_start_date, 2);
    const ceilFinish = addCalendarDays(ceilStart, falseCeilingDuration - 1);
    const tCeil = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: `${floorLabel} False Ceiling Work`,
      section_name: 'Polishing Work',
      category: 'Polishing Work',
      construction_stage: 'Polishing Work',
      floor_zone: floorLabel,
      duration_days: falseCeilingDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tTile.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(ceilStart),
      planned_finish_date: formatDateStr(ceilFinish),
      metadata: { floor_level: f }
    });

    // 4. Door Work
    const doorStart = addCalendarDays(tPaint.planned_finish_date, 1);
    const doorFinish = addCalendarDays(doorStart, doorWorkDuration - 1);
    const tDoor = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: `${floorLabel} Door Work`,
      section_name: 'Polishing Work',
      category: 'Polishing Work',
      construction_stage: 'Polishing Work',
      floor_zone: floorLabel,
      duration_days: doorWorkDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tPaint.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(doorStart),
      planned_finish_date: formatDateStr(doorFinish),
      metadata: { floor_level: f }
    });

    // 5. Window Work
    const winStart = addCalendarDays(tDoor.planned_start_date, 1);
    const winFinish = addCalendarDays(winStart, windowWorkDuration - 1);
    pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: `${floorLabel} Window Work`,
      section_name: 'Polishing Work',
      category: 'Polishing Work',
      construction_stage: 'Polishing Work',
      floor_zone: floorLabel,
      duration_days: windowWorkDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tPaint.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(winStart),
      planned_finish_date: formatDateStr(winFinish),
      metadata: { floor_level: f }
    });
  }

  // =========================================================================
  // SECTION 5: ADDITIONAL WORK (Optional checkboxes: Elevation, Lift, Fire, Solar)
  // Only included when selected in additional_work_config
  // =========================================================================
  const additionalDefs = [
    { key: 'elevation', name: 'Elevation Work', defaultDays: 30, zone: 'External Facade' },
    { key: 'lift', name: 'Lift Installation', defaultDays: 45, zone: 'Lift Shaft' },
    { key: 'fire', name: 'Fire Installation', defaultDays: 30, zone: 'Project Wide' },
    { key: 'solar', name: 'Solar Installation', defaultDays: 15, zone: 'Terrace Level' }
  ];

  additionalDefs.forEach(item => {
    const itemConfig = additionalWorkConfig[item.key];
    const isChecked = typeof itemConfig === 'object' ? itemConfig.enabled : Boolean(itemConfig);

    if (isChecked) {
      let optStartStr;
      let optFinishStr;
      let optDuration;

      if (typeof itemConfig === 'object' && itemConfig.proposed_start && itemConfig.proposed_finish) {
        optStartStr = itemConfig.proposed_start;
        optFinishStr = itemConfig.proposed_finish;
        const sD = parseDateStr(optStartStr);
        const fD = parseDateStr(optFinishStr);
        optDuration = Math.max(1, Math.round((fD - sD) / 86400000) + 1);
      } else {
        const defStart = addCalendarDays(lastRccTask.planned_finish_date, 5);
        optDuration = item.defaultDays;
        const defFinish = addCalendarDays(defStart, optDuration - 1);
        optStartStr = formatDateStr(defStart);
        optFinishStr = formatDateStr(defFinish);
      }

      pushTask({
        temp_id: `draft-${taskOrder}`,
        task_name: item.name,
        section_name: 'Additional Work',
        category: 'Additional Work',
        construction_stage: 'Additional Work',
        floor_zone: item.zone,
        duration_days: optDuration,
        order_index: taskOrder++,
        predecessors: [],
        planned_start_date: optStartStr,
        planned_finish_date: optFinishStr,
        metadata: {
          is_additional_work: true,
          additional_work_key: item.key
        }
      });
    }
  });

  return tasks;
}

module.exports = {
  generateDraftActivities,
  formatDateStr,
  parseDateStr,
  addCalendarDays
};
