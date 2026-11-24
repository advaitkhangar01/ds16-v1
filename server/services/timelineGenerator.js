// server/services/timelineGenerator.js
// DS16 Construction Activity Generation & Automated Gantt Scheduling Engine
// Strictly organized under the 5 Indian Construction Standard Sections:
// 1. Site Preparation
// 2. RCC Work
// 3. Masonry Work
// 4. Finishing Work
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
 * Helper to get English ordinal floor name
 * @param {number} fIdx 0 = Ground Floor, 1 = First Floor, 2 = Second Floor, etc.
 * @returns {string}
 */
function getOrdinalFloorName(fIdx) {
  if (fIdx === 0) return 'Ground Floor';
  if (fIdx === 1) return 'First Floor';
  if (fIdx === 2) return 'Second Floor';
  if (fIdx === 3) return 'Third Floor';
  if (fIdx === 4) return 'Fourth Floor';
  if (fIdx === 5) return 'Fifth Floor';
  if (fIdx === 6) return 'Sixth Floor';
  if (fIdx === 7) return 'Seventh Floor';
  if (fIdx === 8) return 'Eighth Floor';
  if (fIdx === 9) return 'Ninth Floor';
  if (fIdx === 10) return 'Tenth Floor';
  return `${fIdx}th Floor`;
}

/**
 * Authoritative Structural Slab Calculation
 * Calculates the exact breakdown of structural building slabs based on configuration
 * @param {Object} config 
 * @returns {Object}
 */
function calculateStructuralSlabs(config = {}) {
  const floorsCount = Math.max(1, parseInt(config.floors_above_ground, 10) || 4);
  const basementsCount = Math.max(0, parseInt(config.basement_count, 10) || 0);
  const upperParkCount = Math.max(0, parseInt(config.upper_parking_count, 10) || 0);
  const hasTankSlab = config.has_terrace_tank_slab !== false;

  const basementSlabs = basementsCount;
  const plinthSlabs = 1;
  const podiumSlabs = upperParkCount;
  const habitableSlabs = floorsCount;
  const terraceSlabs = 1;
  const tankSlabs = hasTankSlab ? 1 : 0;

  const totalSlabs = basementSlabs + plinthSlabs + podiumSlabs + habitableSlabs + terraceSlabs + tankSlabs;

  return {
    basementSlabs,
    plinthSlabs,
    podiumSlabs,
    habitableSlabs,
    terraceSlabs,
    tankSlabs,
    totalSlabs
  };
}

/**
 * Generate standard construction schedule activities driven by building configuration
 * @param {Object} config Building configuration and duration settings
 * @returns {Array} List of draft activities with proposed dates, dependencies, floor assignments, and section groupings
 */
function generateDraftActivities(config = {}) {
  const N = Math.max(1, parseInt(config.floors_above_ground, 10) || 4);
  const hasTankSlab = config.has_terrace_tank_slab !== false;
  const startDateStr = config.start_date || formatDateStr(new Date());

  // Duration configurations with approved defaults
  const customDurations = config.custom_durations || {};

  // 1. Site Preparation Durations
  const siteClearingDuration = Math.max(1, parseInt(customDurations.site_clearing_days, 10) || 7);
  const excavationDuration = Math.max(1, parseInt(customDurations.excavation_days, 10) || 14);

  // 2. Plinth Work Durations
  const plinthBeamDuration = Math.max(1, parseInt(customDurations.plinth_beam_days, 10) || 10);
  const plinthSlabDuration = Math.max(1, parseInt(customDurations.plinth_slab_days, 10) || 7);

  // 3. Column Work Durations (7 + 7 + 7 = 21 days standard cycle)
  const colSteelDuration = Math.max(1, parseInt(customDurations.col_binding_days || customDurations.col_steel_days, 10) || 7);
  const colShutterDuration = Math.max(1, parseInt(customDurations.col_shuttering_days, 10) || 7);
  const colConcreteDuration = Math.max(1, parseInt(customDurations.col_casting_days || customDurations.col_concrete_days, 10) || 7);

  // 4. Slab Work Durations (Shuttering -> Steel Fixing -> Concreting)
  const slabShutterDuration = Math.max(1, parseInt(customDurations.slab_shuttering_days, 10) || 7);
  const slabSteelDuration = Math.max(1, parseInt(customDurations.slab_steel_days, 10) || 5);
  const slabConcreteDuration = Math.max(1, parseInt(customDurations.slab_concrete_days, 10) || 2);

  // 5. Masonry Work Durations per floor (7 + 4 + 4 + 6 = 21 days standard cycle)
  const brickworkDuration = Math.max(1, parseInt(customDurations.brickwork_days, 10) || 7);
  const elecConduitDuration = Math.max(1, parseInt(customDurations.electrical_piping_days || customDurations.elec_conduit_days, 10) || 4);
  const plumbingDuration = Math.max(1, parseInt(customDurations.plumbing_days, 10) || 4);
  const plasteringDuration = Math.max(1, parseInt(customDurations.plastering_days, 10) || 6);

  // 6. Finishing Work Durations per floor
  const tileFittingDuration = Math.max(1, parseInt(customDurations.tile_fitting_days, 10) || 10);
  const paintingDuration = Math.max(1, parseInt(customDurations.painting_days, 10) || 10);
  const falseCeilingDuration = Math.max(1, parseInt(customDurations.false_ceiling_days, 10) || 7);
  const doorWorkDuration = Math.max(1, parseInt(customDurations.door_work_days, 10) || 5);
  const windowWorkDuration = Math.max(1, parseInt(customDurations.window_work_days, 10) || 5);

  // Configurable floor-to-floor Masonry lag (calendar days)
  const masonryLagDays = Math.max(0, parseInt(config.masonry_lag_days !== undefined ? config.masonry_lag_days : 1, 10));

  // Basements & Upper Parking
  let basementCount = parseInt(config.basement_count, 10);
  if (isNaN(basementCount)) {
    const pFloors = Array.isArray(config.parking_floors) ? config.parking_floors : [];
    basementCount = pFloors.filter(f => f.type?.includes?.('basement')).length;
  }
  basementCount = Math.max(0, basementCount);

  let upperParkingCount = parseInt(config.upper_parking_count, 10);
  if (isNaN(upperParkingCount)) {
    const pFloors = Array.isArray(config.parking_floors) ? config.parking_floors : [];
    upperParkingCount = pFloors.filter(f => f.type === 'upper_parking' || f.type?.includes?.('podium')).length;
  }
  upperParkingCount = Math.max(0, upperParkingCount);

  // Unified Lift Configuration (checks both has_lift and additional_work_config.lift)
  const rawAdditional = config.additional_work_config || {};
  const isLiftEnabled = (rawAdditional.lift !== undefined) 
    ? Boolean(typeof rawAdditional.lift === 'object' ? rawAdditional.lift.enabled : rawAdditional.lift)
    : (config.has_lift !== false);

  const additionalWorkConfig = {
    elevation: Boolean(typeof rawAdditional.elevation === 'object' ? rawAdditional.elevation.enabled : rawAdditional.elevation),
    lift: isLiftEnabled,
    fire: Boolean(
      typeof rawAdditional.fire === 'object' ? rawAdditional.fire.enabled : (rawAdditional.fire || rawAdditional.fire_fighting)
    ),
    solar: Boolean(typeof rawAdditional.solar === 'object' ? rawAdditional.solar.enabled : rawAdditional.solar)
  };

  const tasks = [];
  const keyToTask = {};
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
    keyToTask[t.activity_key] = t;
    return t;
  }

  // =========================================================================
  // SECTION 1: SITE PREPARATION
  // =========================================================================
  const siteClearStart = parseDateStr(startDateStr);
  const siteClearFinish = addCalendarDays(siteClearStart, siteClearingDuration - 1);
  const tSiteClear = pushTask({
    temp_id: `draft-${taskOrder}`,
    activity_key: 'SITE:CLEARING',
    task_name: 'Site Demarcation, Clearing & Levelling',
    section_name: 'Site Preparation',
    category: 'Site Preparation & Excavation',
    construction_stage: 'Site Preparation',
    floor_zone: 'Site Level',
    floor_order: -100,
    duration_days: siteClearingDuration,
    order_index: taskOrder++,
    predecessors: [],
    planned_start_date: formatDateStr(siteClearStart),
    planned_finish_date: formatDateStr(siteClearFinish)
  });

  const excavStart = addCalendarDays(tSiteClear.planned_finish_date, 1);
  const excavFinish = addCalendarDays(excavStart, excavationDuration - 1);
  const tExcavation = pushTask({
    temp_id: `draft-${taskOrder}`,
    activity_key: 'SITE:FOUNDATION_EXCAVATION',
    task_name: 'Foundation Excavation',
    section_name: 'Site Preparation',
    category: 'Site Preparation & Excavation',
    construction_stage: 'Site Preparation',
    floor_zone: 'Foundation Level',
    floor_order: -99,
    duration_days: excavationDuration,
    order_index: taskOrder++,
    predecessors: [{ predecessor_id: tSiteClear.temp_id, predecessor_key: tSiteClear.activity_key, type: 'FS', lag: 0 }],
    planned_start_date: formatDateStr(excavStart),
    planned_finish_date: formatDateStr(excavFinish)
  });

  let prevSubstructureTask = tExcavation;

  // Optional Lift Pit (begins alongside foundation excavation if lift is enabled)
  let tLiftPit = null;
  if (additionalWorkConfig.lift) {
    const liftPitDuration = 10;
    const liftPitStart = addCalendarDays(tExcavation.planned_start_date, 5);
    const liftPitFinish = addCalendarDays(liftPitStart, liftPitDuration - 1);
    tLiftPit = pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: 'ADDITIONAL:LIFT_PIT',
      task_name: 'Lift Pit Waterproofing & Foundation Casting',
      section_name: 'RCC Work',
      category: 'Foundation & Substructure',
      construction_stage: 'Substructure',
      floor_zone: 'Lift Pit Level',
      floor_order: -98,
      duration_days: liftPitDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tExcavation.temp_id, predecessor_key: tExcavation.activity_key, type: 'SS', lag: 5 }],
      planned_start_date: formatDateStr(liftPitStart),
      planned_finish_date: formatDateStr(liftPitFinish),
      metadata: { is_additional_work: true, is_lift_task: true }
    });
  }

  // =========================================================================
  // SECTION 2: RCC WORK
  // =========================================================================

  // Array to collect structural slab concreting tasks counting from Ground Floor
  const rccSlabConcretingTasks = [];

  // 2.1 Basements Substructure (if configured)
  if (basementCount > 0) {
    // Deep Excavation & Shoring
    const deepExDuration = 15;
    const deepExStart = addCalendarDays(prevSubstructureTask.planned_finish_date, 1);
    const deepExFinish = addCalendarDays(deepExStart, deepExDuration - 1);
    const tDeepEx = pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: 'RCC:BASEMENT:DEEP_EXCAVATION',
      task_name: `Deep Excavation & Shoring (${basementCount} Basement Levels)`,
      section_name: 'RCC Work',
      category: 'Foundation & Substructure',
      construction_stage: 'Substructure',
      floor_zone: 'Basement Level',
      floor_order: -50,
      duration_days: deepExDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: prevSubstructureTask.temp_id, predecessor_key: prevSubstructureTask.activity_key, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(deepExStart),
      planned_finish_date: formatDateStr(deepExFinish)
    });

    // Raft Foundation
    const raftDuration = 14;
    const raftStart = addCalendarDays(tDeepEx.planned_finish_date, 1);
    const raftFinish = addCalendarDays(raftStart, raftDuration - 1);
    const tRaft = pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: 'RCC:BASEMENT:RAFT_FOUNDATION',
      task_name: 'RCC Raft Foundation & Footing Casting',
      section_name: 'RCC Work',
      category: 'Foundation & Substructure',
      construction_stage: 'Substructure',
      floor_zone: 'Foundation Level',
      floor_order: -49,
      duration_days: raftDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tDeepEx.temp_id, predecessor_key: tDeepEx.activity_key, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(raftStart),
      planned_finish_date: formatDateStr(raftFinish)
    });
    prevSubstructureTask = tRaft;

    // Build each basement from deepest up to B1
    for (let b = basementCount; b >= 1; b--) {
      const bZone = `Basement ${b}`;
      const fOrder = -b;

      // Retaining Wall & Raft Casting
      const retDuration = 12;
      const retStart = addCalendarDays(prevSubstructureTask.planned_finish_date, 1);
      const retFinish = addCalendarDays(retStart, retDuration - 1);
      const tBRet = pushTask({
        temp_id: `draft-${taskOrder}`,
        activity_key: `RCC:BASEMENT_${b}:RETAINING_WALL`,
        task_name: `${bZone} RCC Retaining Wall & Waterproofing`,
        section_name: 'RCC Work',
        category: 'Foundation & Substructure',
        construction_stage: 'Substructure',
        floor_zone: bZone,
        floor_order: fOrder,
        duration_days: retDuration,
        order_index: taskOrder++,
        predecessors: [{ predecessor_id: prevSubstructureTask.temp_id, predecessor_key: prevSubstructureTask.activity_key, type: 'FS', lag: 0 }],
        planned_start_date: formatDateStr(retStart),
        planned_finish_date: formatDateStr(retFinish)
      });

      // Columns
      const colStart = addCalendarDays(tBRet.planned_finish_date, 1);
      const colFinish = addCalendarDays(colStart, colConcreteDuration - 1);
      const tBCol = pushTask({
        temp_id: `draft-${taskOrder}`,
        activity_key: `RCC:BASEMENT_${b}:COL_CONCRETING`,
        task_name: `${bZone} Columns Concreting`,
        section_name: 'RCC Work',
        category: 'RCC Structural Construction',
        construction_stage: 'RCC Work',
        floor_zone: bZone,
        floor_order: fOrder,
        duration_days: colConcreteDuration,
        order_index: taskOrder++,
        predecessors: [{ predecessor_id: tBRet.temp_id, predecessor_key: tBRet.activity_key, type: 'FS', lag: 0 }],
        planned_start_date: formatDateStr(colStart),
        planned_finish_date: formatDateStr(colFinish)
      });

      // Basement Suspended Slab
      const slabShutStart = addCalendarDays(tBCol.planned_finish_date, 1);
      const slabShutFinish = addCalendarDays(slabShutStart, slabShutterDuration - 1);
      const tBSlabShut = pushTask({
        temp_id: `draft-${taskOrder}`,
        activity_key: `RCC:BASEMENT_${b}:SLAB_SHUTTERING`,
        task_name: `${bZone} Slab Shuttering`,
        section_name: 'RCC Work',
        category: 'RCC Structural Construction',
        construction_stage: 'RCC Work',
        floor_zone: bZone,
        floor_order: fOrder,
        duration_days: slabShutterDuration,
        order_index: taskOrder++,
        predecessors: [{ predecessor_id: tBCol.temp_id, predecessor_key: tBCol.activity_key, type: 'FS', lag: 0 }],
        planned_start_date: formatDateStr(slabShutStart),
        planned_finish_date: formatDateStr(slabShutFinish)
      });

      const slabSteelStart = addCalendarDays(tBSlabShut.planned_finish_date, 1);
      const slabSteelFinish = addCalendarDays(slabSteelStart, slabSteelDuration - 1);
      const tBSlabSteel = pushTask({
        temp_id: `draft-${taskOrder}`,
        activity_key: `RCC:BASEMENT_${b}:SLAB_STEEL_FIXING`,
        task_name: `${bZone} Slab Steel Fixing`,
        section_name: 'RCC Work',
        category: 'RCC Structural Construction',
        construction_stage: 'RCC Work',
        floor_zone: bZone,
        floor_order: fOrder,
        duration_days: slabSteelDuration,
        order_index: taskOrder++,
        predecessors: [{ predecessor_id: tBSlabShut.temp_id, predecessor_key: tBSlabShut.activity_key, type: 'FS', lag: 0 }],
        planned_start_date: formatDateStr(slabSteelStart),
        planned_finish_date: formatDateStr(slabSteelFinish)
      });

      const slabConcStart = addCalendarDays(tBSlabSteel.planned_finish_date, 1);
      const slabConcFinish = addCalendarDays(slabConcStart, slabConcreteDuration - 1);
      const tBSlabConc = pushTask({
        temp_id: `draft-${taskOrder}`,
        activity_key: `RCC:BASEMENT_${b}:SLAB_CONCRETING`,
        task_name: `${bZone} Basement Floor Slab Concreting`,
        section_name: 'RCC Work',
        category: 'RCC Structural Construction',
        construction_stage: 'RCC Work',
        floor_zone: bZone,
        floor_order: fOrder,
        duration_days: slabConcreteDuration,
        order_index: taskOrder++,
        predecessors: [{ predecessor_id: tBSlabSteel.temp_id, predecessor_key: tBSlabSteel.activity_key, type: 'FS', lag: 0 }],
        planned_start_date: formatDateStr(slabConcStart),
        planned_finish_date: formatDateStr(slabConcFinish),
        metadata: { is_basement_slab: true, basement_level: b }
      });

      prevSubstructureTask = tBSlabConc;
    }
  }

  // 2.2 Plinth Work
  // 1. Plinth Beam
  const plinthBeamStart = addCalendarDays(prevSubstructureTask.planned_finish_date, 1);
  const plinthBeamFinish = addCalendarDays(plinthBeamStart, plinthBeamDuration - 1);
  const tPlinthBeam = pushTask({
    temp_id: `draft-${taskOrder}`,
    activity_key: 'RCC:PLINTH:BEAM',
    task_name: 'Plinth Beam',
    section_name: 'RCC Work',
    category: 'Foundation & Substructure',
    construction_stage: 'Substructure',
    floor_zone: 'Plinth Level',
    floor_order: 0,
    duration_days: plinthBeamDuration,
    order_index: taskOrder++,
    predecessors: [{ predecessor_id: prevSubstructureTask.temp_id, predecessor_key: prevSubstructureTask.activity_key, type: 'FS', lag: 0 }],
    planned_start_date: formatDateStr(plinthBeamStart),
    planned_finish_date: formatDateStr(plinthBeamFinish)
  });

  // 2. Plinth Slab
  const plinthSlabStart = addCalendarDays(tPlinthBeam.planned_finish_date, 1);
  const plinthSlabFinish = addCalendarDays(plinthSlabStart, plinthSlabDuration - 1);
  const tPlinthSlab = pushTask({
    temp_id: `draft-${taskOrder}`,
    activity_key: 'RCC:PLINTH:SLAB_CONCRETING',
    task_name: 'Plinth Slab',
    section_name: 'RCC Work',
    category: 'RCC Structural Construction',
    construction_stage: 'RCC Work',
    floor_zone: 'Plinth Level',
    floor_order: 0,
    duration_days: plinthSlabDuration,
    order_index: taskOrder++,
    predecessors: [{ predecessor_id: tPlinthBeam.temp_id, predecessor_key: tPlinthBeam.activity_key, type: 'FS', lag: 0 }],
    planned_start_date: formatDateStr(plinthSlabStart),
    planned_finish_date: formatDateStr(plinthSlabFinish),
    metadata: { is_plinth_slab: true }
  });

  let prevRccTask = tPlinthSlab;

  // 2.3 Ground Floor Column Activities
  const gfZone = config.has_stilt_parking ? 'Ground Floor (Stilt)' : 'Ground Floor';
  const gfColSteelStart = addCalendarDays(prevRccTask.planned_finish_date, 1);
  const gfColSteelFinish = addCalendarDays(gfColSteelStart, colSteelDuration - 1);
  const tGfColSteel = pushTask({
    temp_id: `draft-${taskOrder}`,
    activity_key: 'RCC:GROUND:COL_STEEL_FIXING',
    task_name: 'Ground Floor Column Steel Fixing',
    section_name: 'RCC Work',
    category: 'RCC Structural Construction',
    construction_stage: 'RCC Work',
    floor_zone: gfZone,
    floor_order: 0,
    duration_days: colSteelDuration,
    order_index: taskOrder++,
    predecessors: [{ predecessor_id: prevRccTask.temp_id, predecessor_key: prevRccTask.activity_key, type: 'FS', lag: 0 }],
    planned_start_date: formatDateStr(gfColSteelStart),
    planned_finish_date: formatDateStr(gfColSteelFinish)
  });

  const gfColShutStart = addCalendarDays(tGfColSteel.planned_finish_date, 1);
  const gfColShutFinish = addCalendarDays(gfColShutStart, colShutterDuration - 1);
  const tGfColShut = pushTask({
    temp_id: `draft-${taskOrder}`,
    activity_key: 'RCC:GROUND:COL_SHUTTERING',
    task_name: 'Ground Floor Column Shuttering',
    section_name: 'RCC Work',
    category: 'RCC Structural Construction',
    construction_stage: 'RCC Work',
    floor_zone: gfZone,
    floor_order: 0,
    duration_days: colShutterDuration,
    order_index: taskOrder++,
    predecessors: [{ predecessor_id: tGfColSteel.temp_id, predecessor_key: tGfColSteel.activity_key, type: 'FS', lag: 0 }],
    planned_start_date: formatDateStr(gfColShutStart),
    planned_finish_date: formatDateStr(gfColShutFinish)
  });

  const gfColConcStart = addCalendarDays(tGfColShut.planned_finish_date, 1);
  const gfColConcFinish = addCalendarDays(gfColConcStart, colConcreteDuration - 1);
  const tGfColConc = pushTask({
    temp_id: `draft-${taskOrder}`,
    activity_key: 'RCC:GROUND:COL_CONCRETING',
    task_name: 'Ground Floor Column Concreting',
    section_name: 'RCC Work',
    category: 'RCC Structural Construction',
    construction_stage: 'RCC Work',
    floor_zone: gfZone,
    floor_order: 0,
    duration_days: colConcreteDuration,
    order_index: taskOrder++,
    predecessors: [{ predecessor_id: tGfColShut.temp_id, predecessor_key: tGfColShut.activity_key, type: 'FS', lag: 0 }],
    planned_start_date: formatDateStr(gfColConcStart),
    planned_finish_date: formatDateStr(gfColConcFinish)
  });

  prevRccTask = tGfColConc;

  // 2.4 Podium / Upper-Floor Parking (if configured)
  if (upperParkingCount > 0) {
    for (let p = 1; p <= upperParkingCount; p++) {
      const pZone = `Podium ${p}`;
      const pOrder = 10 * p;

      // Slab Shuttering
      const pSlabShutStart = addCalendarDays(prevRccTask.planned_finish_date, 1);
      const pSlabShutFinish = addCalendarDays(pSlabShutStart, slabShutterDuration - 1);
      const tPSlabShut = pushTask({
        temp_id: `draft-${taskOrder}`,
        activity_key: `RCC:PODIUM_${p}:SLAB_SHUTTERING`,
        task_name: `${pZone} Slab Shuttering`,
        section_name: 'RCC Work',
        category: 'RCC Structural Construction',
        construction_stage: 'RCC Work',
        floor_zone: pZone,
        floor_order: pOrder,
        duration_days: slabShutterDuration,
        order_index: taskOrder++,
        predecessors: [{ predecessor_id: prevRccTask.temp_id, predecessor_key: prevRccTask.activity_key, type: 'FS', lag: 0 }],
        planned_start_date: formatDateStr(pSlabShutStart),
        planned_finish_date: formatDateStr(pSlabShutFinish)
      });

      // Slab Steel Fixing
      const pSlabSteelStart = addCalendarDays(tPSlabShut.planned_finish_date, 1);
      const pSlabSteelFinish = addCalendarDays(pSlabSteelStart, slabSteelDuration - 1);
      const tPSlabSteel = pushTask({
        temp_id: `draft-${taskOrder}`,
        activity_key: `RCC:PODIUM_${p}:SLAB_STEEL_FIXING`,
        task_name: `${pZone} Slab Steel Fixing`,
        section_name: 'RCC Work',
        category: 'RCC Structural Construction',
        construction_stage: 'RCC Work',
        floor_zone: pZone,
        floor_order: pOrder,
        duration_days: slabSteelDuration,
        order_index: taskOrder++,
        predecessors: [{ predecessor_id: tPSlabShut.temp_id, predecessor_key: tPSlabShut.activity_key, type: 'FS', lag: 0 }],
        planned_start_date: formatDateStr(pSlabSteelStart),
        planned_finish_date: formatDateStr(pSlabSteelFinish)
      });

      // Slab Concreting
      const pSlabConcStart = addCalendarDays(tPSlabSteel.planned_finish_date, 1);
      const pSlabConcFinish = addCalendarDays(pSlabConcStart, slabConcreteDuration - 1);
      const tPSlabConc = pushTask({
        temp_id: `draft-${taskOrder}`,
        activity_key: `RCC:PODIUM_${p}:SLAB_CONCRETING`,
        task_name: `${pZone} Floor Slab Concreting`,
        section_name: 'RCC Work',
        category: 'RCC Structural Construction',
        construction_stage: 'RCC Work',
        floor_zone: pZone,
        floor_order: pOrder,
        duration_days: slabConcreteDuration,
        order_index: taskOrder++,
        predecessors: [{ predecessor_id: tPSlabSteel.temp_id, predecessor_key: tPSlabSteel.activity_key, type: 'FS', lag: 0 }],
        planned_start_date: formatDateStr(pSlabConcStart),
        planned_finish_date: formatDateStr(pSlabConcFinish),
        metadata: { is_podium_slab: true, podium_level: p }
      });

      // Columns supporting next level
      const pColSteelStart = addCalendarDays(tPSlabConc.planned_finish_date, 1);
      const pColSteelFinish = addCalendarDays(pColSteelStart, colSteelDuration - 1);
      const tPColSteel = pushTask({
        temp_id: `draft-${taskOrder}`,
        activity_key: `RCC:PODIUM_${p}:COL_STEEL_FIXING`,
        task_name: `${pZone} Column Steel Fixing`,
        section_name: 'RCC Work',
        category: 'RCC Structural Construction',
        construction_stage: 'RCC Work',
        floor_zone: pZone,
        floor_order: pOrder,
        duration_days: colSteelDuration,
        order_index: taskOrder++,
        predecessors: [{ predecessor_id: tPSlabConc.temp_id, predecessor_key: tPSlabConc.activity_key, type: 'FS', lag: 0 }],
        planned_start_date: formatDateStr(pColSteelStart),
        planned_finish_date: formatDateStr(pColSteelFinish)
      });

      const pColShutStart = addCalendarDays(tPColSteel.planned_finish_date, 1);
      const pColShutFinish = addCalendarDays(pColShutStart, colShutterDuration - 1);
      const tPColShut = pushTask({
        temp_id: `draft-${taskOrder}`,
        activity_key: `RCC:PODIUM_${p}:COL_SHUTTERING`,
        task_name: `${pZone} Column Shuttering`,
        section_name: 'RCC Work',
        category: 'RCC Structural Construction',
        construction_stage: 'RCC Work',
        floor_zone: pZone,
        floor_order: pOrder,
        duration_days: colShutterDuration,
        order_index: taskOrder++,
        predecessors: [{ predecessor_id: tPColSteel.temp_id, predecessor_key: tPColSteel.activity_key, type: 'FS', lag: 0 }],
        planned_start_date: formatDateStr(pColShutStart),
        planned_finish_date: formatDateStr(pColShutFinish)
      });

      const pColConcStart = addCalendarDays(tPColShut.planned_finish_date, 1);
      const pColConcFinish = addCalendarDays(pColConcStart, colConcreteDuration - 1);
      const tPColConc = pushTask({
        temp_id: `draft-${taskOrder}`,
        activity_key: `RCC:PODIUM_${p}:COL_CONCRETING`,
        task_name: `${pZone} Column Concreting`,
        section_name: 'RCC Work',
        category: 'RCC Structural Construction',
        construction_stage: 'RCC Work',
        floor_zone: pZone,
        floor_order: pOrder,
        duration_days: colConcreteDuration,
        order_index: taskOrder++,
        predecessors: [{ predecessor_id: tPColShut.temp_id, predecessor_key: tPColShut.activity_key, type: 'FS', lag: 0 }],
        planned_start_date: formatDateStr(pColConcStart),
        planned_finish_date: formatDateStr(pColConcFinish)
      });

      // Podium Ramp & Finishes
      const rampStart = addCalendarDays(tPColConc.planned_finish_date, 1);
      const rampFinish = addCalendarDays(rampStart, 7);
      pushTask({
        temp_id: `draft-${taskOrder}`,
        activity_key: `RCC:PODIUM_${p}:RAMP_FINISH`,
        task_name: `${pZone} Vehicle Access Ramp & Epoxy Floor Coating`,
        section_name: 'RCC Work',
        category: 'RCC Structural Construction',
        construction_stage: 'RCC Work',
        floor_zone: pZone,
        floor_order: pOrder,
        duration_days: 8,
        order_index: taskOrder++,
        predecessors: [{ predecessor_id: tPColConc.temp_id, predecessor_key: tPColConc.activity_key, type: 'FS', lag: 0 }],
        planned_start_date: formatDateStr(rampStart),
        planned_finish_date: formatDateStr(rampFinish)
      });

      prevRccTask = tPColConc;
    }
  }

  // 2.5 Habitable Floors (Floors 1 to N)
  // For each habitable floor f (1 to N):
  // Slab activities: Slab Shuttering, Slab Steel Fixing, Slab Concreting
  // Column activities: Column Steel Fixing, Column Shuttering, Column Concreting
  for (let f = 1; f <= N; f++) {
    const floorLabel = getOrdinalFloorName(f);
    const fOrder = 100 + f;

    // 1. Slab Shuttering
    const slabShutStart = addCalendarDays(prevRccTask.planned_finish_date, 1);
    const slabShutFinish = addCalendarDays(slabShutStart, slabShutterDuration - 1);
    const tSlabShut = pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: `RCC:FLOOR_${f}:SLAB_SHUTTERING`,
      task_name: `${floorLabel} Slab Shuttering`,
      section_name: 'RCC Work',
      category: 'RCC Structural Construction',
      construction_stage: 'RCC Work',
      floor_zone: floorLabel,
      floor_order: fOrder,
      duration_days: slabShutterDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: prevRccTask.temp_id, predecessor_key: prevRccTask.activity_key, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(slabShutStart),
      planned_finish_date: formatDateStr(slabShutFinish)
    });

    // 2. Slab Steel Fixing
    const slabSteelStart = addCalendarDays(tSlabShut.planned_finish_date, 1);
    const slabSteelFinish = addCalendarDays(slabSteelStart, slabSteelDuration - 1);
    const tSlabSteel = pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: `RCC:FLOOR_${f}:SLAB_STEEL_FIXING`,
      task_name: `${floorLabel} Slab Steel Fixing`,
      section_name: 'RCC Work',
      category: 'RCC Structural Construction',
      construction_stage: 'RCC Work',
      floor_zone: floorLabel,
      floor_order: fOrder,
      duration_days: slabSteelDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tSlabShut.temp_id, predecessor_key: tSlabShut.activity_key, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(slabSteelStart),
      planned_finish_date: formatDateStr(slabSteelFinish)
    });

    // 3. Slab Concreting
    const isThirdSlabFromGround = (f === 3);
    const slabConcStart = addCalendarDays(tSlabSteel.planned_finish_date, 1);
    const slabConcFinish = addCalendarDays(slabConcStart, slabConcreteDuration - 1);
    const tSlabConc = pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: `RCC:FLOOR_${f}:SLAB_CONCRETING`,
      task_name: `${floorLabel} Slab Concreting`,
      section_name: 'RCC Work',
      category: 'RCC Structural Construction',
      construction_stage: 'RCC Work',
      floor_zone: floorLabel,
      floor_order: fOrder,
      duration_days: slabConcreteDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tSlabSteel.temp_id, predecessor_key: tSlabSteel.activity_key, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(slabConcStart),
      planned_finish_date: formatDateStr(slabConcFinish),
      is_milestone: isThirdSlabFromGround,
      metadata: {
        is_habitable_slab: true,
        slab_floor_level: f,
        is_trigger_milestone: isThirdSlabFromGround,
        milestone_code: isThirdSlabFromGround ? 'SLAB_3RD_FLOOR' : null
      }
    });

    rccSlabConcretingTasks.push(tSlabConc);

    // 4. Column Steel Fixing
    const colSteelStart = addCalendarDays(tSlabConc.planned_finish_date, 1);
    const colSteelFinish = addCalendarDays(colSteelStart, colSteelDuration - 1);
    const tColSteel = pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: `RCC:FLOOR_${f}:COL_STEEL_FIXING`,
      task_name: `${floorLabel} Column Steel Fixing`,
      section_name: 'RCC Work',
      category: 'RCC Structural Construction',
      construction_stage: 'RCC Work',
      floor_zone: floorLabel,
      floor_order: fOrder,
      duration_days: colSteelDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tSlabConc.temp_id, predecessor_key: tSlabConc.activity_key, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(colSteelStart),
      planned_finish_date: formatDateStr(colSteelFinish)
    });

    // 5. Column Shuttering
    const colShutStart = addCalendarDays(tColSteel.planned_finish_date, 1);
    const colShutFinish = addCalendarDays(colShutStart, colShutterDuration - 1);
    const tColShut = pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: `RCC:FLOOR_${f}:COL_SHUTTERING`,
      task_name: `${floorLabel} Column Shuttering`,
      section_name: 'RCC Work',
      category: 'RCC Structural Construction',
      construction_stage: 'RCC Work',
      floor_zone: floorLabel,
      floor_order: fOrder,
      duration_days: colShutterDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tColSteel.temp_id, predecessor_key: tColSteel.activity_key, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(colShutStart),
      planned_finish_date: formatDateStr(colShutFinish)
    });

    // 6. Column Concreting
    const colConcStart = addCalendarDays(tColShut.planned_finish_date, 1);
    const colConcFinish = addCalendarDays(colConcStart, colConcreteDuration - 1);
    const tColConc = pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: `RCC:FLOOR_${f}:COL_CONCRETING`,
      task_name: `${floorLabel} Column Concreting`,
      section_name: 'RCC Work',
      category: 'RCC Structural Construction',
      construction_stage: 'RCC Work',
      floor_zone: floorLabel,
      floor_order: fOrder,
      duration_days: colConcreteDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tColShut.temp_id, predecessor_key: tColShut.activity_key, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(colConcStart),
      planned_finish_date: formatDateStr(colConcFinish)
    });

    prevRccTask = tColConc;
  }

  // 2.6 Terrace
  // Slab Shuttering, Steel Fixing, Concreting
  const terraceShutStart = addCalendarDays(prevRccTask.planned_finish_date, 1);
  const terraceShutFinish = addCalendarDays(terraceShutStart, slabShutterDuration - 1);
  const tTerraceShut = pushTask({
    temp_id: `draft-${taskOrder}`,
    activity_key: 'RCC:TERRACE:SLAB_SHUTTERING',
    task_name: 'Terrace Slab Shuttering',
    section_name: 'RCC Work',
    category: 'RCC Structural Construction',
    construction_stage: 'RCC Work',
    floor_zone: 'Terrace Level',
    floor_order: 200,
    duration_days: slabShutterDuration,
    order_index: taskOrder++,
    predecessors: [{ predecessor_id: prevRccTask.temp_id, predecessor_key: prevRccTask.activity_key, type: 'FS', lag: 0 }],
    planned_start_date: formatDateStr(terraceShutStart),
    planned_finish_date: formatDateStr(terraceShutFinish)
  });

  const terraceSteelStart = addCalendarDays(tTerraceShut.planned_finish_date, 1);
  const terraceSteelFinish = addCalendarDays(terraceSteelStart, slabSteelDuration - 1);
  const tTerraceSteel = pushTask({
    temp_id: `draft-${taskOrder}`,
    activity_key: 'RCC:TERRACE:SLAB_STEEL_FIXING',
    task_name: 'Terrace Slab Steel Fixing',
    section_name: 'RCC Work',
    category: 'RCC Structural Construction',
    construction_stage: 'RCC Work',
    floor_zone: 'Terrace Level',
    floor_order: 200,
    duration_days: slabSteelDuration,
    order_index: taskOrder++,
    predecessors: [{ predecessor_id: tTerraceShut.temp_id, predecessor_key: tTerraceShut.activity_key, type: 'FS', lag: 0 }],
    planned_start_date: formatDateStr(terraceSteelStart),
    planned_finish_date: formatDateStr(terraceSteelFinish)
  });

  const terraceConcStart = addCalendarDays(tTerraceSteel.planned_finish_date, 1);
  const terraceConcFinish = addCalendarDays(terraceConcStart, slabConcreteDuration - 1);
  const tTerraceConc = pushTask({
    temp_id: `draft-${taskOrder}`,
    activity_key: 'RCC:TERRACE:SLAB_CONCRETING',
    task_name: 'Terrace Slab Concreting',
    section_name: 'RCC Work',
    category: 'RCC Structural Construction',
    construction_stage: 'RCC Work',
    floor_zone: 'Terrace Level',
    floor_order: 200,
    duration_days: slabConcreteDuration,
    order_index: taskOrder++,
    predecessors: [{ predecessor_id: tTerraceSteel.temp_id, predecessor_key: tTerraceSteel.activity_key, type: 'FS', lag: 0 }],
    planned_start_date: formatDateStr(terraceConcStart),
    planned_finish_date: formatDateStr(terraceConcFinish),
    metadata: { is_terrace_slab: true }
  });

  prevRccTask = tTerraceConc;

  // 2.7 Overhead Water Tank (when enabled)
  let tTankSlabConc = null;
  if (hasTankSlab) {
    // Water Tank Columns (Steel Fixing, Shuttering, Concreting)
    const tankColSteelStart = addCalendarDays(prevRccTask.planned_finish_date, 1);
    const tankColSteelFinish = addCalendarDays(tankColSteelStart, colSteelDuration - 1);
    const tTankColSteel = pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: 'RCC:TANK:COL_STEEL_FIXING',
      task_name: 'Water Tank Column Steel Fixing',
      section_name: 'RCC Work',
      category: 'RCC Structural Construction',
      construction_stage: 'RCC Work',
      floor_zone: 'Water Tank',
      floor_order: 210,
      duration_days: colSteelDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: prevRccTask.temp_id, predecessor_key: prevRccTask.activity_key, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(tankColSteelStart),
      planned_finish_date: formatDateStr(tankColSteelFinish)
    });

    const tankColShutStart = addCalendarDays(tTankColSteel.planned_finish_date, 1);
    const tankColShutFinish = addCalendarDays(tankColShutStart, colShutterDuration - 1);
    const tTankColShut = pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: 'RCC:TANK:COL_SHUTTERING',
      task_name: 'Water Tank Column Shuttering',
      section_name: 'RCC Work',
      category: 'RCC Structural Construction',
      construction_stage: 'RCC Work',
      floor_zone: 'Water Tank',
      floor_order: 210,
      duration_days: colShutterDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tTankColSteel.temp_id, predecessor_key: tTankColSteel.activity_key, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(tankColShutStart),
      planned_finish_date: formatDateStr(tankColShutFinish)
    });

    const tankColConcStart = addCalendarDays(tTankColShut.planned_finish_date, 1);
    const tankColConcFinish = addCalendarDays(tankColConcStart, colConcreteDuration - 1);
    const tTankColConc = pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: 'RCC:TANK:COL_CONCRETING',
      task_name: 'Water Tank Column Concreting',
      section_name: 'RCC Work',
      category: 'RCC Structural Construction',
      construction_stage: 'RCC Work',
      floor_zone: 'Water Tank',
      floor_order: 210,
      duration_days: colConcreteDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tTankColShut.temp_id, predecessor_key: tTankColShut.activity_key, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(tankColConcStart),
      planned_finish_date: formatDateStr(tankColConcFinish)
    });

    // Water Tank Slab (Shuttering, Steel Fixing, Concreting)
    const tankSlabShutStart = addCalendarDays(tTankColConc.planned_finish_date, 1);
    const tankSlabShutFinish = addCalendarDays(tankSlabShutStart, slabShutterDuration - 1);
    const tTankSlabShut = pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: 'RCC:TANK:SLAB_SHUTTERING',
      task_name: 'Water Tank Slab Shuttering',
      section_name: 'RCC Work',
      category: 'RCC Structural Construction',
      construction_stage: 'RCC Work',
      floor_zone: 'Water Tank',
      floor_order: 210,
      duration_days: slabShutterDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tTankColConc.temp_id, predecessor_key: tTankColConc.activity_key, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(tankSlabShutStart),
      planned_finish_date: formatDateStr(tankSlabShutFinish)
    });

    const tankSlabSteelStart = addCalendarDays(tTankSlabShut.planned_finish_date, 1);
    const tankSlabSteelFinish = addCalendarDays(tankSlabSteelStart, slabSteelDuration - 1);
    const tTankSlabSteel = pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: 'RCC:TANK:SLAB_STEEL_FIXING',
      task_name: 'Water Tank Slab Steel Fixing',
      section_name: 'RCC Work',
      category: 'RCC Structural Construction',
      construction_stage: 'RCC Work',
      floor_zone: 'Water Tank',
      floor_order: 210,
      duration_days: slabSteelDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tTankSlabShut.temp_id, predecessor_key: tTankSlabShut.activity_key, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(tankSlabSteelStart),
      planned_finish_date: formatDateStr(tankSlabSteelFinish)
    });

    const tankSlabConcStart = addCalendarDays(tTankSlabSteel.planned_finish_date, 1);
    const tankSlabConcFinish = addCalendarDays(tankSlabConcStart, slabConcreteDuration - 1);
    tTankSlabConc = pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: 'RCC:TANK:SLAB_CONCRETING',
      task_name: 'Water Tank Slab Concreting',
      section_name: 'RCC Work',
      category: 'RCC Structural Construction',
      construction_stage: 'RCC Work',
      floor_zone: 'Water Tank',
      floor_order: 210,
      duration_days: slabConcreteDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tTankSlabSteel.temp_id, predecessor_key: tTankSlabSteel.activity_key, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(tankSlabConcStart),
      planned_finish_date: formatDateStr(tankSlabConcFinish),
      is_milestone: true,
      metadata: { is_rcc_final_milestone: true, is_tank_slab: true }
    });

    prevRccTask = tTankSlabConc;
  }

  const lastRccTask = prevRccTask;

  // =========================================================================
  // SECTION 3: MASONRY WORK
  // =========================================================================
  // Confirmed Masonry Trigger:
  // "Third slab casting in the RCC sequence, counting from the Ground Floor slab"
  // For buildings with >= 3 habitable floors: 3rd slab casting is Third Floor Slab Concreting!
  // Ground Floor Brickwork starts next calendar day (+1 lag).
  // For buildings with < 3 habitable floors: Ground Floor Brickwork starts after complete RCC finishes.
  let masonryTriggerTask = null;
  const qualifiesForThirdSlabTrigger = (N >= 3 && rccSlabConcretingTasks.length >= 3);

  if (qualifiesForThirdSlabTrigger) {
    masonryTriggerTask = rccSlabConcretingTasks[2]; // 3rd slab casting (0-indexed 2 = 3rd slab)
  } else {
    masonryTriggerTask = lastRccTask;
  }

  const masonryStartRefDate = addCalendarDays(masonryTriggerTask.planned_finish_date, masonryLagDays);

  // Store floor plastering tasks to drive floor-wise finishing triggers
  const floorPlasteringTasks = {};
  let prevFloorBrickworkTask = null;

  // Generate Masonry for each above-ground floor: Ground Floor (f=0) through Floor N (f=N)
  for (let f = 0; f <= N; f++) {
    const floorLabel = getOrdinalFloorName(f);
    const fOrder = (f === 0) ? 0 : (100 + f);

    // 1. Brickwork
    let brickStart;
    let brickPredecessors = [];

    if (f === 0) {
      // Ground floor brickwork starts after 3rd slab casting (or after RCC completion) with configured lag
      brickStart = masonryStartRefDate;
      brickPredecessors = [{
        predecessor_id: masonryTriggerTask.temp_id,
        predecessor_key: masonryTriggerTask.activity_key,
        type: 'FS',
        lag: masonryLagDays
      }];
    } else {
      // Subsequent floors start after preceding floor's Brickwork with configurable masonryLagDays
      brickStart = addCalendarDays(prevFloorBrickworkTask.planned_start_date, masonryLagDays);
      // Ensure brickwork does not precede previous floor brickwork start
      brickPredecessors = [{
        predecessor_id: prevFloorBrickworkTask.temp_id,
        predecessor_key: prevFloorBrickworkTask.activity_key,
        type: 'SS',
        lag: masonryLagDays
      }];
    }

    const brickFinish = addCalendarDays(brickStart, brickworkDuration - 1);
    const tBrick = pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: `MASONRY:FLOOR_${f}:BRICKWORK`,
      task_name: `${floorLabel} Brickwork`,
      section_name: 'Masonry Work',
      category: 'Masonry & Brickwork',
      construction_stage: 'Masonry Work',
      floor_zone: floorLabel,
      floor_order: fOrder,
      duration_days: brickworkDuration,
      order_index: taskOrder++,
      predecessors: brickPredecessors,
      planned_start_date: formatDateStr(brickStart),
      planned_finish_date: formatDateStr(brickFinish),
      metadata: {
        floor_level: f,
        is_ground_brickwork: f === 0,
        has_structural_trigger: (f === 0 && qualifiesForThirdSlabTrigger),
        is_manually_scheduled: (f === 0 && !qualifiesForThirdSlabTrigger)
      }
    });

    prevFloorBrickworkTask = tBrick;

    // 2. Electrical Conduit Work
    const elecStart = addCalendarDays(tBrick.planned_finish_date, 1);
    const elecFinish = addCalendarDays(elecStart, elecConduitDuration - 1);
    const tElec = pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: `MASONRY:FLOOR_${f}:ELECTRICAL_CONDUIT`,
      task_name: `${floorLabel} Electrical Conduit Work`,
      section_name: 'Masonry Work',
      category: 'Electrical & Low Voltage',
      construction_stage: 'Masonry Work',
      floor_zone: floorLabel,
      floor_order: fOrder,
      duration_days: elecConduitDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tBrick.temp_id, predecessor_key: tBrick.activity_key, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(elecStart),
      planned_finish_date: formatDateStr(elecFinish),
      metadata: { floor_level: f }
    });

    // 3. Plumbing Work
    const plumbStart = addCalendarDays(tElec.planned_finish_date, 1);
    const plumbFinish = addCalendarDays(plumbStart, plumbingDuration - 1);
    const tPlumb = pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: `MASONRY:FLOOR_${f}:PLUMBING`,
      task_name: `${floorLabel} Plumbing Work`,
      section_name: 'Masonry Work',
      category: 'Plumbing & Sanitary',
      construction_stage: 'Masonry Work',
      floor_zone: floorLabel,
      floor_order: fOrder,
      duration_days: plumbingDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tElec.temp_id, predecessor_key: tElec.activity_key, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(plumbStart),
      planned_finish_date: formatDateStr(plumbFinish),
      metadata: { floor_level: f }
    });

    // 4. Plastering
    const plastStart = addCalendarDays(tPlumb.planned_finish_date, 1);
    const plastFinish = addCalendarDays(plastStart, plasteringDuration - 1);
    const tPlast = pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: `MASONRY:FLOOR_${f}:PLASTERING`,
      task_name: `${floorLabel} Plastering`,
      section_name: 'Masonry Work',
      category: 'Plastering & Surface Preparation',
      construction_stage: 'Masonry Work',
      floor_zone: floorLabel,
      floor_order: fOrder,
      duration_days: plasteringDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tPlumb.temp_id, predecessor_key: tPlumb.activity_key, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(plastStart),
      planned_finish_date: formatDateStr(plastFinish),
      metadata: { floor_level: f, is_floor_plastering: true }
    });

    floorPlasteringTasks[f] = tPlast;
  }

  // =========================================================================
  // SECTION 4: FINISHING WORK
  // =========================================================================
  // Confirmed Finishing Trigger:
  // Finishing for a particular floor becomes eligible as soon as that floor's Plastering completes!
  // Does NOT wait for building RCC or all masonry.
  for (let f = 0; f <= N; f++) {
    const floorLabel = getOrdinalFloorName(f);
    const fOrder = (f === 0) ? 0 : (100 + f);
    const floorPlastTask = floorPlasteringTasks[f];

    const finishStart = addCalendarDays(floorPlastTask.planned_finish_date, 1);

    // 1. Tile Fitting
    const tileStart = finishStart;
    const tileFinish = addCalendarDays(tileStart, tileFittingDuration - 1);
    const tTile = pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: `FINISHING:FLOOR_${f}:TILE_FITTING`,
      task_name: `${floorLabel} Tile Fitting`,
      section_name: 'Finishing Work',
      category: 'Flooring & Tiling',
      construction_stage: 'Finishing Work',
      floor_zone: floorLabel,
      floor_order: fOrder,
      duration_days: tileFittingDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: floorPlastTask.temp_id, predecessor_key: floorPlastTask.activity_key, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(tileStart),
      planned_finish_date: formatDateStr(tileFinish),
      metadata: { floor_level: f }
    });

    // 2. Painting
    const paintStart = addCalendarDays(tTile.planned_finish_date, 1);
    const paintFinish = addCalendarDays(paintStart, paintingDuration - 1);
    const tPaint = pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: `FINISHING:FLOOR_${f}:PAINTING`,
      task_name: `${floorLabel} Painting`,
      section_name: 'Finishing Work',
      category: 'Painting & Finishing',
      construction_stage: 'Finishing Work',
      floor_zone: floorLabel,
      floor_order: fOrder,
      duration_days: paintingDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tTile.temp_id, predecessor_key: tTile.activity_key, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(paintStart),
      planned_finish_date: formatDateStr(paintFinish),
      metadata: { floor_level: f }
    });

    // 3. False Ceiling Work (starts 2 days after Painting start)
    const ceilStart = addCalendarDays(tPaint.planned_start_date, 2);
    const ceilFinish = addCalendarDays(ceilStart, falseCeilingDuration - 1);
    const tCeil = pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: `FINISHING:FLOOR_${f}:FALSE_CEILING`,
      task_name: `${floorLabel} False Ceiling Work`,
      section_name: 'Finishing Work',
      category: 'Plastering & Surface Preparation',
      construction_stage: 'Finishing Work',
      floor_zone: floorLabel,
      floor_order: fOrder,
      duration_days: falseCeilingDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tPaint.temp_id, predecessor_key: tPaint.activity_key, type: 'SS', lag: 2 }],
      planned_start_date: formatDateStr(ceilStart),
      planned_finish_date: formatDateStr(ceilFinish),
      metadata: { floor_level: f }
    });

    // 4. Door Fitting (follows Painting)
    const doorStart = addCalendarDays(tPaint.planned_finish_date, 1);
    const doorFinish = addCalendarDays(doorStart, doorWorkDuration - 1);
    const tDoor = pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: `FINISHING:FLOOR_${f}:DOOR_FITTING`,
      task_name: `${floorLabel} Door Fitting`,
      section_name: 'Finishing Work',
      category: 'Doors, Windows & Fabrication',
      construction_stage: 'Finishing Work',
      floor_zone: floorLabel,
      floor_order: fOrder,
      duration_days: doorWorkDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tPaint.temp_id, predecessor_key: tPaint.activity_key, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(doorStart),
      planned_finish_date: formatDateStr(doorFinish),
      metadata: { floor_level: f }
    });

    // 5. Window Fitting (starts 1 day after Door Fitting start)
    const winStart = addCalendarDays(tDoor.planned_start_date, 1);
    const winFinish = addCalendarDays(winStart, windowWorkDuration - 1);
    pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: `FINISHING:FLOOR_${f}:WINDOW_FITTING`,
      task_name: `${floorLabel} Window Fitting`,
      section_name: 'Finishing Work',
      category: 'Doors, Windows & Fabrication',
      construction_stage: 'Finishing Work',
      floor_zone: floorLabel,
      floor_order: fOrder,
      duration_days: windowWorkDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tDoor.temp_id, predecessor_key: tDoor.activity_key, type: 'SS', lag: 1 }],
      planned_start_date: formatDateStr(winStart),
      planned_finish_date: formatDateStr(winFinish),
      metadata: { floor_level: f }
    });
  }

  // =========================================================================
  // SECTION 5: ADDITIONAL WORK
  // Only selected activities are generated
  // =========================================================================

  // 1. Elevation Work
  if (additionalWorkConfig.elevation) {
    const eleDef = rawAdditional.elevation || {};
    const eleDuration = 30;
    const eleStart = eleDef.proposed_start ? parseDateStr(eleDef.proposed_start) : addCalendarDays(lastRccTask.planned_finish_date, 5);
    const eleFinish = eleDef.proposed_finish ? parseDateStr(eleDef.proposed_finish) : addCalendarDays(eleStart, eleDuration - 1);
    pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: 'ADDITIONAL:ELEVATION',
      task_name: 'Elevation Work',
      section_name: 'Additional Work',
      category: 'Painting & Finishing',
      construction_stage: 'Additional Work',
      floor_zone: 'External Facade',
      floor_order: 300,
      duration_days: Math.max(1, Math.round((eleFinish - eleStart) / 86400000) + 1),
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: lastRccTask.temp_id, predecessor_key: lastRccTask.activity_key, type: 'FS', lag: 5 }],
      planned_start_date: formatDateStr(eleStart),
      planned_finish_date: formatDateStr(eleFinish),
      metadata: { is_additional_work: true, additional_work_key: 'elevation' }
    });
  }

  // 2. Lift / Elevator System (Integrated Sequence)
  if (additionalWorkConfig.lift) {
    // A. Lift Shaft
    const liftShaftDuration = 25;
    const liftShaftStart = addCalendarDays(tGfColConc.planned_finish_date, 1);
    const liftShaftFinish = addCalendarDays(liftShaftStart, liftShaftDuration - 1);
    const tLiftShaft = pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: 'ADDITIONAL:LIFT_SHAFT',
      task_name: 'RCC Lift Shaft Construction',
      section_name: 'Additional Work',
      category: 'Vertical Transportation',
      construction_stage: 'Superstructure & Slab',
      floor_zone: 'Lift Core',
      floor_order: 301,
      duration_days: liftShaftDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tGfColConc.temp_id, predecessor_key: tGfColConc.activity_key, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(liftShaftStart),
      planned_finish_date: formatDateStr(liftShaftFinish),
      metadata: { is_additional_work: true, is_lift_task: true }
    });

    // B. Lift Machine Room (on Terrace)
    const liftMrDuration = 10;
    const liftMrStart = addCalendarDays(tTerraceConc.planned_finish_date, 1);
    const liftMrFinish = addCalendarDays(liftMrStart, liftMrDuration - 1);
    const tLiftMr = pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: 'ADDITIONAL:LIFT_MACHINE_ROOM',
      task_name: 'Lift Machine Room Pedestals & Structural Slab',
      section_name: 'Additional Work',
      category: 'Vertical Transportation',
      construction_stage: 'Superstructure & Slab',
      floor_zone: 'Terrace Level',
      floor_order: 302,
      duration_days: liftMrDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tTerraceConc.temp_id, predecessor_key: tTerraceConc.activity_key, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(liftMrStart),
      planned_finish_date: formatDateStr(liftMrFinish),
      metadata: { is_additional_work: true, is_lift_task: true }
    });

    // C. Elevator Installation
    const liftInstDuration = 30;
    const liftInstStart = addCalendarDays(tLiftMr.planned_finish_date, 1);
    const liftInstFinish = addCalendarDays(liftInstStart, liftInstDuration - 1);
    const tLiftInst = pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: 'ADDITIONAL:LIFT_INSTALLATION',
      task_name: 'Elevator Installation & Mechanical Assembly',
      section_name: 'Additional Work',
      category: 'Vertical Transportation',
      construction_stage: 'Additional Work',
      floor_zone: 'Lift Shaft',
      floor_order: 303,
      duration_days: liftInstDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tLiftMr.temp_id, predecessor_key: tLiftMr.activity_key, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(liftInstStart),
      planned_finish_date: formatDateStr(liftInstFinish),
      metadata: { is_additional_work: true, is_lift_task: true }
    });

    // D. Elevator Commissioning & Government Inspection
    const liftCommDuration = 10;
    const liftCommStart = addCalendarDays(tLiftInst.planned_finish_date, 1);
    const liftCommFinish = addCalendarDays(liftCommStart, liftCommDuration - 1);
    pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: 'ADDITIONAL:LIFT_COMMISSIONING',
      task_name: 'Elevator Safety Inspection & Licensing Commissioning',
      section_name: 'Additional Work',
      category: 'Vertical Transportation',
      construction_stage: 'Handover',
      floor_zone: 'Project Wide',
      floor_order: 304,
      duration_days: liftCommDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tLiftInst.temp_id, predecessor_key: tLiftInst.activity_key, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(liftCommStart),
      planned_finish_date: formatDateStr(liftCommFinish),
      metadata: { is_additional_work: true, is_lift_task: true }
    });
  }

  // 3. Fire Fighting Work
  if (additionalWorkConfig.fire) {
    const fireDef = rawAdditional.fire || {};
    const fireDuration = 30;
    const fireStart = fireDef.proposed_start ? parseDateStr(fireDef.proposed_start) : addCalendarDays(lastRccTask.planned_finish_date, 7);
    const fireFinish = fireDef.proposed_finish ? parseDateStr(fireDef.proposed_finish) : addCalendarDays(fireStart, fireDuration - 1);
    pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: 'ADDITIONAL:FIRE_FIGHTING',
      task_name: 'Fire Fighting Work',
      section_name: 'Additional Work',
      category: 'Plumbing & Sanitary',
      construction_stage: 'Additional Work',
      floor_zone: 'Project Wide',
      floor_order: 305,
      duration_days: Math.max(1, Math.round((fireFinish - fireStart) / 86400000) + 1),
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: lastRccTask.temp_id, predecessor_key: lastRccTask.activity_key, type: 'FS', lag: 7 }],
      planned_start_date: formatDateStr(fireStart),
      planned_finish_date: formatDateStr(fireFinish),
      metadata: { is_additional_work: true, additional_work_key: 'fire' }
    });
  }

  // 4. Solar Installation
  if (additionalWorkConfig.solar) {
    const solarDef = rawAdditional.solar || {};
    const solarDuration = 15;
    const solarStart = solarDef.proposed_start ? parseDateStr(solarDef.proposed_start) : addCalendarDays(lastRccTask.planned_finish_date, 10);
    const solarFinish = solarDef.proposed_finish ? parseDateStr(solarDef.proposed_finish) : addCalendarDays(solarStart, solarDuration - 1);
    pushTask({
      temp_id: `draft-${taskOrder}`,
      activity_key: 'ADDITIONAL:SOLAR_INSTALLATION',
      task_name: 'Solar Installation',
      section_name: 'Additional Work',
      category: 'Electrical & Low Voltage',
      construction_stage: 'Additional Work',
      floor_zone: 'Terrace Level',
      floor_order: 306,
      duration_days: Math.max(1, Math.round((solarFinish - solarStart) / 86400000) + 1),
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: lastRccTask.temp_id, predecessor_key: lastRccTask.activity_key, type: 'FS', lag: 10 }],
      planned_start_date: formatDateStr(solarStart),
      planned_finish_date: formatDateStr(solarFinish),
      metadata: { is_additional_work: true, additional_work_key: 'solar' }
    });
  }

  return tasks;
}

module.exports = {
  generateDraftActivities,
  calculateStructuralSlabs,
  getOrdinalFloorName,
  formatDateStr,
  parseDateStr,
  addCalendarDays
};
