// server/services/timelineGenerator.js
// Construction activity generation engine based on building configuration and verified civil engineering sequencing

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
 * @param {Object} config Building configuration
 * @param {number} config.floors_above_ground Number of upper floors (N)
 * @param {string} config.ground_floor_config Ground floor type ('parking_and_rooms', 'stilt_parking', 'commercial', etc.)
 * @param {boolean} config.has_terrace_tank_slab Whether additional terrace water tank slab is included (N+2 rule)
 * @param {string} config.start_date Baseline project start date (YYYY-MM-DD)
 * @returns {Array} List of draft activities with planned start, end, duration, dependencies, and floor assignments
 */
function generateDraftActivities(config) {
  const N = parseInt(config.floors_above_ground, 10) || 4;
  const hasTankSlab = config.has_terrace_tank_slab !== false;
  const startDateStr = config.start_date || formatDateStr(new Date());

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

  const hasLift = config.has_lift !== false;

  let currentDate = parseDateStr(startDateStr);
  const tasks = [];
  let taskOrder = 1;

  // Helper to append a task with baseline and forecast dates
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

  // --- STAGE 1: SITE PREPARATION & SUBSTRUCTURE ---
  const siteClearDuration = 7;
  const siteClearStart = currentDate;
  const siteClearFinish = addCalendarDays(siteClearStart, siteClearDuration - 1);
  const tSiteClear = pushTask({
    temp_id: `draft-${taskOrder}`,
    task_name: 'Site Demarcation, Clearing & Leveling',
    category: 'Site Preparation & Excavation',
    construction_stage: 'Site Preparation',
    floor_zone: 'Site Level',
    duration_days: siteClearDuration,
    order_index: taskOrder++,
    predecessors: [],
    planned_start_date: formatDateStr(siteClearStart),
    planned_finish_date: formatDateStr(siteClearFinish)
  });

  let prevSubstructureTask = tSiteClear;
  let tExcavation;
  let tPCC;
  let tFootings;
  let tPlinth;

  if (basementCount === 0) {
    // STANDARD SUBSTRUCTURE WITHOUT BASEMENTS
    const excavDuration = 15;
    const excavStart = addCalendarDays(prevSubstructureTask.planned_finish_date, 1);
    const excavFinish = addCalendarDays(excavStart, excavDuration - 1);
    tExcavation = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: 'Earthwork Excavation for Foundations & Footings',
      category: 'Site Preparation & Excavation',
      construction_stage: 'Substructure',
      floor_zone: 'Foundation Level',
      duration_days: excavDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: prevSubstructureTask.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(excavStart),
      planned_finish_date: formatDateStr(excavFinish)
    });

    const pccDuration = 7;
    const pccStart = addCalendarDays(tExcavation.planned_finish_date, 1);
    const pccFinish = addCalendarDays(pccStart, pccDuration - 1);
    tPCC = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: 'PCC Bed Concreting & Anti-Termite Treatment',
      category: 'Foundation & Substructure',
      construction_stage: 'Substructure',
      floor_zone: 'Foundation Level',
      duration_days: pccDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tExcavation.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(pccStart),
      planned_finish_date: formatDateStr(pccFinish)
    });

    const footingsDuration = 14;
    const footingsStart = addCalendarDays(tPCC.planned_finish_date, 1);
    const footingsFinish = addCalendarDays(footingsStart, footingsDuration - 1);
    tFootings = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: 'RCC Column Footings / Raft Reinforcement & Pouring',
      category: 'Foundation & Substructure',
      construction_stage: 'Substructure',
      floor_zone: 'Foundation Level',
      duration_days: footingsDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tPCC.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(footingsStart),
      planned_finish_date: formatDateStr(footingsFinish)
    });

    const plinthDuration = 12;
    const plinthStart = addCalendarDays(tFootings.planned_finish_date, 1);
    const plinthFinish = addCalendarDays(plinthStart, plinthDuration - 1);
    tPlinth = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: 'Plinth Beams Casting, Earth Backfilling & Compaction',
      category: 'Foundation & Substructure',
      construction_stage: 'Substructure',
      floor_zone: 'Plinth Level',
      duration_days: plinthDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tFootings.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(plinthStart),
      planned_finish_date: formatDateStr(plinthFinish)
    });

    prevSubstructureTask = tPlinth;
  } else {
    // SUBSTRUCTURE WITH CONFIGURABLE BASEMENTS (B1, B2, ...)
    const excavDuration = 18 + (basementCount * 7);
    const excavStart = addCalendarDays(prevSubstructureTask.planned_finish_date, 1);
    const excavFinish = addCalendarDays(excavStart, excavDuration - 1);
    tExcavation = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: `Deep Excavation & Shoring / Piling (${basementCount} Basement Levels)`,
      category: 'Site Preparation & Excavation',
      construction_stage: 'Substructure',
      floor_zone: `Basement ${basementCount} Level`,
      duration_days: excavDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: prevSubstructureTask.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(excavStart),
      planned_finish_date: formatDateStr(excavFinish),
      metadata: { basement_count: basementCount }
    });

    const pccDuration = 8;
    const pccStart = addCalendarDays(tExcavation.planned_finish_date, 1);
    const pccFinish = addCalendarDays(pccStart, pccDuration - 1);
    tPCC = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: 'PCC Bedding & Heavy-duty Sub-raft Waterproofing Membrane',
      category: 'Foundation & Substructure',
      construction_stage: 'Substructure',
      floor_zone: `Basement ${basementCount} Level`,
      duration_days: pccDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tExcavation.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(pccStart),
      planned_finish_date: formatDateStr(pccFinish)
    });

    const raftDuration = 18;
    const raftStart = addCalendarDays(tPCC.planned_finish_date, 1);
    const raftFinish = addCalendarDays(raftStart, raftDuration - 1);
    tFootings = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: 'RCC Raft Foundation, Water Sump & Sub-structure Base Pouring',
      category: 'Foundation & Substructure',
      construction_stage: 'Substructure',
      floor_zone: `Basement ${basementCount} Level`,
      duration_days: raftDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tPCC.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(raftStart),
      planned_finish_date: formatDateStr(raftFinish)
    });

    let prevBasementTask = tFootings;

    // Floor-by-floor basement slabs and retaining walls (from deepest level up to Basement 1)
    for (let b = basementCount; b >= 1; b--) {
      const bZone = `Basement ${b}`;
      const retDuration = 15;
      const retStart = addCalendarDays(prevBasementTask.planned_finish_date, 1);
      const retFinish = addCalendarDays(retStart, retDuration - 1);
      const tRetaining = pushTask({
        temp_id: `draft-${taskOrder}`,
        task_name: `${bZone} — RCC Peripheral Retaining Wall Casting & External Waterproofing`,
        category: 'Foundation & Substructure',
        construction_stage: 'Substructure',
        floor_zone: bZone,
        duration_days: retDuration,
        order_index: taskOrder++,
        predecessors: [{ predecessor_id: prevBasementTask.temp_id, type: 'FS', lag: 0 }],
        planned_start_date: formatDateStr(retStart),
        planned_finish_date: formatDateStr(retFinish),
        metadata: { basement_level: b, floor_type: `BASEMENT_${b}` }
      });

      const bSlabDuration = 16;
      const bSlabStart = addCalendarDays(tRetaining.planned_finish_date, 1);
      const bSlabFinish = addCalendarDays(bSlabStart, bSlabDuration - 1);
      const tBSlab = pushTask({
        temp_id: `draft-${taskOrder}`,
        task_name: `${bZone} — RCC Columns & Suspended Basement Floor Slab Casting`,
        category: 'RCC Structural Construction',
        construction_stage: 'Substructure',
        floor_zone: bZone,
        duration_days: bSlabDuration,
        order_index: taskOrder++,
        predecessors: [{ predecessor_id: tRetaining.temp_id, type: 'FS', lag: 0 }],
        planned_start_date: formatDateStr(bSlabStart),
        planned_finish_date: formatDateStr(bSlabFinish),
        metadata: { basement_level: b, floor_type: `BASEMENT_${b}`, is_basement_slab: true }
      });

      prevBasementTask = tBSlab;
    }

    const plinthDuration = 12;
    const plinthStart = addCalendarDays(prevBasementTask.planned_finish_date, 1);
    const plinthFinish = addCalendarDays(plinthStart, plinthDuration - 1);
    tPlinth = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: 'Plinth Beams Casting, Earth Backfilling & Ground Grade Slab Concreting',
      category: 'Foundation & Substructure',
      construction_stage: 'Substructure',
      floor_zone: 'Plinth Level',
      duration_days: plinthDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: prevBasementTask.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(plinthStart),
      planned_finish_date: formatDateStr(plinthFinish)
    });

    prevSubstructureTask = tPlinth;
  }

  // LIFT PIT (Substructure task when Lift is enabled)
  let tLiftPit = null;
  if (hasLift) {
    const liftPitDuration = 10;
    const liftPitStart = addCalendarDays(tPCC.planned_start_date, 2);
    const liftPitFinish = addCalendarDays(liftPitStart, liftPitDuration - 1);
    tLiftPit = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: 'Lift Pit Excavation, Reinforced Pit Base & Box-Type Waterproofing',
      category: 'Foundation & Substructure',
      construction_stage: 'Substructure',
      floor_zone: 'Foundation Level',
      duration_days: liftPitDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tPCC.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(liftPitStart),
      planned_finish_date: formatDateStr(liftPitFinish),
      metadata: { is_lift_task: true, lift_component: 'PIT' }
    });
  }

  // --- STAGE 2: RCC SUPERSTRUCTURE & SLABS ---
  const slabTasks = [];
  let prevSlabTask = prevSubstructureTask;

  // Ground Floor Roof Slab (Slab 1)
  const gndSlabDuration = 16;
  const gndSlabStart = addCalendarDays(prevSlabTask.planned_finish_date, 1);
  const gndSlabFinish = addCalendarDays(gndSlabStart, gndSlabDuration - 1);
  const tGroundSlab = pushTask({
    temp_id: `draft-${taskOrder}`,
    task_name: 'RCC Slab 1: Ground Floor Columns & Roof Slab Casting',
    category: 'RCC Structural Construction',
    construction_stage: 'Superstructure & Slab',
    floor_zone: 'Ground Floor',
    duration_days: gndSlabDuration,
    order_index: taskOrder++,
    predecessors: [{ predecessor_id: prevSlabTask.temp_id, type: 'FS', lag: 0 }],
    planned_start_date: formatDateStr(gndSlabStart),
    planned_finish_date: formatDateStr(gndSlabFinish),
    metadata: { slab_number: 1, floor_level: 0 }
  });
  slabTasks.push(tGroundSlab);
  prevSlabTask = tGroundSlab;

  // Upper-Floor Parking (Podium) Slabs
  const upperParkingTasks = [];
  for (let p = 1; p <= upperParkingCount; p++) {
    const pDuration = 18;
    const pStart = addCalendarDays(prevSlabTask.planned_finish_date, 1);
    const pFinish = addCalendarDays(pStart, pDuration - 1);
    const tParkingSlab = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: `RCC Slab: Podium / Upper Parking ${p} Columns & Floor Slab Casting`,
      category: 'RCC Structural Construction',
      construction_stage: 'Superstructure & Slab',
      floor_zone: `Upper Parking ${p}`,
      duration_days: pDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: prevSlabTask.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(pStart),
      planned_finish_date: formatDateStr(pFinish),
      metadata: { is_upper_parking_slab: true, parking_level: p, floor_type: 'UPPER_PARKING' }
    });
    upperParkingTasks.push(tParkingSlab);
    slabTasks.push(tParkingSlab);
    prevSlabTask = tParkingSlab;
  }

  // Track the 3rd floor slab activity (representing 3rd floor columns & slab casting)
  let tSlab3rdFloor = null;

  // Upper Habitable Floor Slabs (Floors 1 to N)
  for (let i = 1; i <= N; i++) {
    const isTopRoof = (i === N);
    const floorLabel = i === 1 ? '1st Floor' : i === 2 ? '2nd Floor' : i === 3 ? '3rd Floor' : `${i}th Floor`;
    const slabNumber = i + 1 + upperParkingCount;
    const slabTitle = isTopRoof 
      ? `RCC Slab ${slabNumber}: ${floorLabel} Final Roof Slab Casting` 
      : `RCC Slab ${slabNumber}: ${floorLabel} Columns & Floor Slab Casting`;

    const slabDuration = isTopRoof ? 20 : 21;
    const slabStart = addCalendarDays(prevSlabTask.planned_finish_date, 1);
    const slabFinish = addCalendarDays(slabStart, slabDuration - 1);

    const is3rdFloorSlab = (i === 3);

    const tFloorSlab = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: slabTitle,
      category: 'RCC Structural Construction',
      construction_stage: 'Superstructure & Slab',
      floor_zone: floorLabel,
      duration_days: slabDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: prevSlabTask.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(slabStart),
      planned_finish_date: formatDateStr(slabFinish),
      is_milestone: is3rdFloorSlab,
      metadata: {
        slab_number: slabNumber,
        slab_floor: i,
        floor_level: i,
        is_trigger_milestone: is3rdFloorSlab,
        milestone_code: is3rdFloorSlab ? 'SLAB_3RD_FLOOR' : null,
        milestone_purpose: is3rdFloorSlab ? 'TRIGGER_GROUND_BRICKWORK' : null,
        milestone_label: is3rdFloorSlab ? 'Third-Floor Slab Completion Milestone' : null
      }
    });

    if (is3rdFloorSlab) {
      tSlab3rdFloor = tFloorSlab;
    }

    slabTasks.push(tFloorSlab);
    prevSlabTask = tFloorSlab;
  }

  // Terrace Water Tank Slab (N+2 rule)
  let tTankSlab = null;
  if (hasTankSlab) {
    const tankSlabNumber = N + 2 + upperParkingCount;
    const tankDuration = 20;
    const tankStart = addCalendarDays(prevSlabTask.planned_finish_date, 1);
    const tankFinish = addCalendarDays(tankStart, tankDuration - 1);
    const tankTitle = hasLift
      ? `RCC Slab ${tankSlabNumber}: Overhead Water Tank & Lift Machine Room Slab`
      : `RCC Slab ${tankSlabNumber}: Overhead Water Tank Slab`;
    tTankSlab = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: tankTitle,
      category: 'RCC Structural Construction',
      construction_stage: 'Superstructure & Slab',
      floor_zone: 'Terrace Level',
      duration_days: tankDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: prevSlabTask.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(tankStart),
      planned_finish_date: formatDateStr(tankFinish),
      is_milestone: false,
      metadata: { slab_number: tankSlabNumber, is_water_tank_slab: true }
    });
    slabTasks.push(tTankSlab);
    prevSlabTask = tTankSlab;
  }

  // --- STAGE 3: FLOOR-WISE MASONRY, PLASTERING, PLUMBING, ELECTRICAL & TILING ---
  // Floor zones: Ground Floor, 1st Floor, 2nd Floor, 3rd Floor...
  const floorZones = ['Ground Floor'];
  for (let f = 1; f <= N; f++) {
    floorZones.push(f === 1 ? '1st Floor' : f === 2 ? '2nd Floor' : f === 3 ? '3rd Floor' : `${f}th Floor`);
  }

  floorZones.forEach((zone, idx) => {
    let tBrick;
    const brickDuration = 22;

    if (idx === 0) {
      // GROUND-FLOOR BRICKWORK
      // AUTHORITATIVE BUSINESS RULE:
      // For buildings with 3 or more floors above ground (N >= 3):
      // Ground-floor brickwork starts on the calendar day immediately following the completion of the 3rd-floor slab.
      // The trigger is always the 3rd-floor slab, regardless of how many additional floors exist.
      // For G+2 or fewer: No automatic trigger; administrator schedules manually.
      if (N >= 3 && tSlab3rdFloor) {
        const projectedBrickStart = addCalendarDays(tSlab3rdFloor.planned_finish_date, 1);
        const projectedBrickFinish = addCalendarDays(projectedBrickStart, brickDuration - 1);

        tBrick = pushTask({
          temp_id: `draft-${taskOrder}`,
          task_name: `${zone} - Brickwork & Internal Partition Masonry`,
          category: 'Masonry & Brickwork',
          construction_stage: 'Finishing & Services',
          floor_zone: zone,
          duration_days: brickDuration,
          order_index: taskOrder++,
          predecessors: [{
            predecessor_id: tSlab3rdFloor.temp_id,
            type: 'FS',
            lag: 1
          }],
          planned_start_date: formatDateStr(projectedBrickStart),
          planned_finish_date: formatDateStr(projectedBrickFinish),
          is_milestone: false,
          metadata: {
            is_ground_brickwork: true,
            has_structural_trigger: true,
            trigger_milestone_code: 'SLAB_3RD_FLOOR',
            trigger_task_temp_id: tSlab3rdFloor.temp_id
          }
        });
      } else {
        // G+2 or fewer: Keep ground-floor brickwork dates management-controlled (no automatic 3rd floor trigger)
        // No hidden 14-day lag, no false structural dependency; management determines schedule
        tBrick = pushTask({
          temp_id: `draft-${taskOrder}`,
          task_name: `${zone} - Brickwork & Internal Partition Masonry`,
          category: 'Masonry & Brickwork',
          construction_stage: 'Finishing & Services',
          floor_zone: zone,
          duration_days: brickDuration,
          order_index: taskOrder++,
          predecessors: [],
          planned_start_date: formatDateStr(currentDate),
          planned_finish_date: formatDateStr(addCalendarDays(currentDate, brickDuration - 1)),
          is_milestone: false,
          metadata: {
            is_ground_brickwork: true,
            is_manually_scheduled: true,
            has_structural_trigger: false
          }
        });
      }
    } else {
      // Upper Floors (1st Floor, 2nd Floor, etc.)
      // Floor k brickwork begins after respective floor slab pour & curing (10 days de-shuttering)
      const parentSlab = slabTasks[idx] || slabTasks[slabTasks.length - 1];
      const upperBrickStart = addCalendarDays(parentSlab.planned_finish_date, 10);
      const upperBrickFinish = addCalendarDays(upperBrickStart, brickDuration - 1);

      tBrick = pushTask({
        temp_id: `draft-${taskOrder}`,
        task_name: `${zone} - Brickwork & Internal Partition Masonry`,
        category: 'Masonry & Brickwork',
        construction_stage: 'Finishing & Services',
        floor_zone: zone,
        duration_days: brickDuration,
        order_index: taskOrder++,
        predecessors: [{
          predecessor_id: parentSlab.temp_id,
          type: 'FS',
          lag: 10
        }],
        planned_start_date: formatDateStr(upperBrickStart),
        planned_finish_date: formatDateStr(upperBrickFinish),
        is_milestone: false,
        metadata: { floor_level: idx }
      });
    }

    // Electrical Concealed Conduit Piping & Metal Box Fixing (Independent activity per floor)
    const eleDuration = 14;
    const eleStart = addCalendarDays(tBrick.planned_start_date, 10);
    const eleFinish = addCalendarDays(eleStart, eleDuration - 1);
    const tElec = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: `${zone} - Electrical Concealed Conduit Piping & Metal Box Fixing`,
      category: 'Electrical & Low Voltage',
      construction_stage: 'Finishing & Services',
      floor_zone: zone,
      duration_days: eleDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tBrick.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(eleStart),
      planned_finish_date: formatDateStr(eleFinish),
      metadata: { floor_level: idx }
    });

    // Concealed CPVC/UPVC Plumbing Lines & Drain Outlets (Independent activity per floor, runs concurrent with Electrical)
    const plumbDuration = 14;
    const plumbStart = addCalendarDays(tBrick.planned_start_date, 12);
    const plumbFinish = addCalendarDays(plumbStart, plumbDuration - 1);
    const tPlumb = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: `${zone} - Concealed CPVC/UPVC Plumbing Lines & Drain Outlets`,
      category: 'Plumbing & Sanitary',
      construction_stage: 'Finishing & Services',
      floor_zone: zone,
      duration_days: plumbDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tBrick.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(plumbStart),
      planned_finish_date: formatDateStr(plumbFinish),
      metadata: { floor_level: idx }
    });

    // Internal Cement Plastering & Jamb Finishes (Follows Electrical & Plumbing)
    const plastDuration = 15;
    const plastStart = addCalendarDays(tElec.planned_finish_date, 1);
    const plastFinish = addCalendarDays(plastStart, plastDuration - 1);
    const tPlaster = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: `${zone} - Internal Cement Plastering & Jamb Finishes`,
      category: 'Plastering & Surface Preparation',
      construction_stage: 'Finishing & Services',
      floor_zone: zone,
      duration_days: plastDuration,
      order_index: taskOrder++,
      predecessors: [
        { predecessor_id: tElec.temp_id, type: 'FS', lag: 0 },
        { predecessor_id: tPlumb.temp_id, type: 'FS', lag: 0 }
      ],
      planned_start_date: formatDateStr(plastStart),
      planned_finish_date: formatDateStr(plastFinish),
      metadata: { floor_level: idx }
    });

    // Wet Area Waterproofing
    const wpDuration = 12;
    const wpStart = addCalendarDays(tPlaster.planned_finish_date, 2);
    const wpFinish = addCalendarDays(wpStart, wpDuration - 1);
    const tWP = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: `${zone} - Toilet & Balcony Waterproofing with Brick Bat Coba`,
      category: 'Waterproofing',
      construction_stage: 'Finishing & Services',
      floor_zone: zone,
      duration_days: wpDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tPlaster.temp_id, type: 'FS', lag: 2 }],
      planned_start_date: formatDateStr(wpStart),
      planned_finish_date: formatDateStr(wpFinish),
      metadata: { floor_level: idx }
    });

    // Flooring & Tiling
    const tileDuration = 18;
    const tileStart = addCalendarDays(tWP.planned_finish_date, 2);
    const tileFinish = addCalendarDays(tileStart, tileDuration - 1);
    pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: `${zone} - Vitrified Floor Tiling & Ceramic Wall Cladding`,
      category: 'Flooring & Tiling',
      construction_stage: 'Finishing & Services',
      floor_zone: zone,
      duration_days: tileDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tWP.temp_id, type: 'FS', lag: 2 }],
      planned_start_date: formatDateStr(tileStart),
      planned_finish_date: formatDateStr(tileFinish),
      metadata: { floor_level: idx }
    });
  });

  // --- STAGE 4: TERRACE, EXTERNAL PLASTERING & FAÇADE ---
  const lastSlab = slabTasks[slabTasks.length - 1];

  const terraceParapetDuration = 15;
  const terraceWPStart = addCalendarDays(lastSlab.planned_finish_date, 5);
  const terraceParapetFinish = addCalendarDays(terraceWPStart, terraceParapetDuration - 1);
  const tTerraceParapet = pushTask({
    temp_id: `draft-${taskOrder}`,
    task_name: 'Terrace Parapet Brickwork & Coping Casting',
    category: 'Masonry & Brickwork',
    construction_stage: 'Finishing & Services',
    floor_zone: 'Terrace Level',
    duration_days: terraceParapetDuration,
    order_index: taskOrder++,
    predecessors: [{ predecessor_id: lastSlab.temp_id, type: 'FS', lag: 5 }],
    planned_start_date: formatDateStr(terraceWPStart),
    planned_finish_date: formatDateStr(terraceParapetFinish)
  });

  const terraceWPDuration = 18;
  const tTerraceWPStart = addCalendarDays(tTerraceParapet.planned_finish_date, 1);
  const tTerraceWPFinish = addCalendarDays(tTerraceWPStart, terraceWPDuration - 1);
  const tTerraceWP = pushTask({
    temp_id: `draft-${taskOrder}`,
    task_name: 'Terrace Waterproofing, Insulation & China Mosaic / Tile Finish',
    category: 'Waterproofing',
    construction_stage: 'Finishing & Services',
    floor_zone: 'Terrace Level',
    duration_days: terraceWPDuration,
    order_index: taskOrder++,
    predecessors: [{ predecessor_id: tTerraceParapet.temp_id, type: 'FS', lag: 0 }],
    planned_start_date: formatDateStr(tTerraceWPStart),
    planned_finish_date: formatDateStr(tTerraceWPFinish)
  });

  // External Plastering All Sides
  const extPlasterDuration = 45;
  const extPlasterStart = addCalendarDays(lastSlab.planned_finish_date, 10);
  const extPlasterFinish = addCalendarDays(extPlasterStart, extPlasterDuration - 1);
  const tExtPlaster = pushTask({
    temp_id: `draft-${taskOrder}`,
    task_name: 'External Wall Double-Coat Weather Plaster with Grooving',
    category: 'Plastering & Surface Preparation',
    construction_stage: 'Finishing & Services',
    floor_zone: 'External Facade',
    duration_days: extPlasterDuration,
    order_index: taskOrder++,
    predecessors: [{ predecessor_id: lastSlab.temp_id, type: 'FS', lag: 10 }],
    planned_start_date: formatDateStr(extPlasterStart),
    planned_finish_date: formatDateStr(extPlasterFinish)
  });

  // Windows, Doors & Glass
  const winDuration = 25;
  const winStart = addCalendarDays(tExtPlaster.planned_start_date, 30);
  const winFinish = addCalendarDays(winStart, winDuration - 1);
  const tWindows = pushTask({
    temp_id: `draft-${taskOrder}`,
    task_name: 'UPVC / Aluminum Window Frames, Glazing & Shutters',
    category: 'Doors, Windows & Fabrication',
    construction_stage: 'Finishing & Services',
    floor_zone: 'All Floors',
    duration_days: winDuration,
    order_index: taskOrder++,
    predecessors: [{ predecessor_id: tExtPlaster.temp_id, type: 'FS', lag: 0 }],
    planned_start_date: formatDateStr(winStart),
    planned_finish_date: formatDateStr(winFinish)
  });

  // External Painting
  const extPaintDuration = 30;
  const extPaintStart = addCalendarDays(tExtPlaster.planned_finish_date, 5);
  const extPaintFinish = addCalendarDays(extPaintStart, extPaintDuration - 1);
  const tExtPaint = pushTask({
    temp_id: `draft-${taskOrder}`,
    task_name: 'External Surface Primer, Weatherproof Texture & Painting',
    category: 'Painting & Finishing',
    construction_stage: 'Finishing & Services',
    floor_zone: 'External Facade',
    duration_days: extPaintDuration,
    order_index: taskOrder++,
    predecessors: [{ predecessor_id: tExtPlaster.temp_id, type: 'FS', lag: 5 }],
    planned_start_date: formatDateStr(extPaintStart),
    planned_finish_date: formatDateStr(extPaintFinish)
  });

  // Fire Fighting & Services
  const fireDuration = 30;
  const fireStart = addCalendarDays(tTerraceWP.planned_finish_date, 5);
  const fireFinish = addCalendarDays(fireStart, fireDuration - 1);
  const tFire = pushTask({
    temp_id: `draft-${taskOrder}`,
    task_name: 'Fire Fighting Riser Piping, Hydrants & Alarm Infrastructure',
    category: 'Testing, Commissioning & Handover',
    construction_stage: 'Finishing & Services',
    floor_zone: 'Common Areas',
    duration_days: fireDuration,
    order_index: taskOrder++,
    predecessors: [{ predecessor_id: tTerraceWP.temp_id, type: 'FS', lag: 5 }],
    planned_start_date: formatDateStr(fireStart),
    planned_finish_date: formatDateStr(fireFinish)
  });

  // External Site Development
  const siteDevDuration = 25;
  const siteDevStart = addCalendarDays(tExtPaint.planned_start_date, 10);
  const siteDevFinish = addCalendarDays(siteDevStart, siteDevDuration - 1);
  const tSiteDev = pushTask({
    temp_id: `draft-${taskOrder}`,
    task_name: 'External Sewer, Storm Water Drainage, Pavers & Compound Gate',
    category: 'External Development & Site Works',
    construction_stage: 'Finishing & Services',
    floor_zone: 'Site Level',
    duration_days: siteDevDuration,
    order_index: taskOrder++,
    predecessors: [{ predecessor_id: tExtPaint.temp_id, type: 'FS', lag: 0 }],
    planned_start_date: formatDateStr(siteDevStart),
    planned_finish_date: formatDateStr(siteDevFinish)
  });

  // --- LIFT / ELEVATOR SYSTEM (When hasLift is enabled) ---
  if (hasLift) {
    // 1. Lift Well Shaft (RCC Shear Wall)
    const liftShaftDuration = 35;
    const liftShaftStart = addCalendarDays(tGroundSlab.planned_finish_date, 5);
    const liftShaftFinish = addCalendarDays(liftShaftStart, liftShaftDuration - 1);
    const tLiftShaft = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: 'RCC Lift Shaft & Shear Wall Construction (Ground to Terrace)',
      category: 'Elevator & Core Works',
      construction_stage: 'Superstructure & Slab',
      floor_zone: 'Core / Shaft',
      duration_days: liftShaftDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tGroundSlab.temp_id, type: 'FS', lag: 5 }],
      planned_start_date: formatDateStr(liftShaftStart),
      planned_finish_date: formatDateStr(liftShaftFinish),
      metadata: { is_lift_task: true, lift_component: 'SHAFT' }
    });

    // 2. Machine Room Pedestals & Hoist Beam (Terrace level)
    const topSlabTask = tTankSlab || slabTasks[slabTasks.length - 1];
    const mrDuration = 12;
    const mrStart = addCalendarDays(topSlabTask.planned_finish_date, 1);
    const mrFinish = addCalendarDays(mrStart, mrDuration - 1);
    const tLiftMR = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: 'Lift Machine Room Equipment Pedestals & Overhead Hoist Beam Installation',
      category: 'Finishing & Services',
      construction_stage: 'Finishing & Services',
      floor_zone: 'Terrace Level',
      duration_days: mrDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: topSlabTask.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(mrStart),
      planned_finish_date: formatDateStr(mrFinish),
      metadata: { is_lift_task: true, lift_component: 'MACHINE_ROOM' }
    });

    // 3. Mechanical Guide Rails & Car Installation
    const liftMechDuration = 20;
    const liftMechStart = addCalendarDays(tLiftMR.planned_finish_date, 3);
    const liftMechFinish = addCalendarDays(liftMechStart, liftMechDuration - 1);
    const tLiftMech = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: 'Elevator Installation: Guide Rails, Counterweights, Car Assembly & Traction Motor',
      category: 'Finishing & Services',
      construction_stage: 'Finishing & Services',
      floor_zone: 'Core / Shaft',
      duration_days: liftMechDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tLiftMR.temp_id, type: 'FS', lag: 3 }],
      planned_start_date: formatDateStr(liftMechStart),
      planned_finish_date: formatDateStr(liftMechFinish),
      metadata: { is_lift_task: true, lift_component: 'MECHANICAL' }
    });

    // 4. Electrical Control Panel, Wiring & Landing Doors
    const liftElecDuration = 14;
    const liftElecStart = addCalendarDays(tLiftMech.planned_start_date, 10);
    const liftElecFinish = addCalendarDays(liftElecStart, liftElecDuration - 1);
    const tLiftElec = pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: 'Elevator Electrical: Microprocessor Control Panel, Cabling & Landing Door Integration',
      category: 'Electrical & Low Voltage',
      construction_stage: 'Finishing & Services',
      floor_zone: 'All Floors',
      duration_days: liftElecDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tLiftMech.temp_id, type: 'FS', lag: 0 }],
      planned_start_date: formatDateStr(liftElecStart),
      planned_finish_date: formatDateStr(liftElecFinish),
      metadata: { is_lift_task: true, lift_component: 'ELECTRICAL' }
    });

    // 5. Testing, Licensing & Commissioning
    const liftTestDuration = 10;
    const liftTestStart = addCalendarDays(liftElecFinish, 2);
    const liftTestFinish = addCalendarDays(liftTestStart, liftTestDuration - 1);
    pushTask({
      temp_id: `draft-${taskOrder}`,
      task_name: 'Elevator Safety Inspection, Government Licensing & Final Handover Commissioning',
      category: 'Testing, Commissioning & Handover',
      construction_stage: 'Handover',
      floor_zone: 'Core / Shaft',
      duration_days: liftTestDuration,
      order_index: taskOrder++,
      predecessors: [{ predecessor_id: tLiftElec.temp_id, type: 'FS', lag: 2 }],
      planned_start_date: formatDateStr(liftTestStart),
      planned_finish_date: formatDateStr(liftTestFinish),
      metadata: { is_lift_task: true, lift_component: 'COMMISSIONING' }
    });
  }

  // --- BASEMENT & PARKING FINISHES ---
  if (basementCount > 0) {
    for (let b = 1; b <= basementCount; b++) {
      const bZone = `Basement ${b}`;
      const bFinDuration = 15;
      const bFinStart = addCalendarDays(tExtPlaster.planned_finish_date, 2);
      const bFinFinish = addCalendarDays(bFinStart, bFinDuration - 1);
      pushTask({
        temp_id: `draft-${taskOrder}`,
        task_name: `${bZone} — Sump Pump Drainage, Mechanical Ventilation Ducting & Epoxy Flooring`,
        category: 'Finishing & Services',
        construction_stage: 'Finishing & Services',
        floor_zone: bZone,
        duration_days: bFinDuration,
        order_index: taskOrder++,
        predecessors: [{ predecessor_id: tExtPlaster.temp_id, type: 'FS', lag: 2 }],
        planned_start_date: formatDateStr(bFinStart),
        planned_finish_date: formatDateStr(bFinFinish),
        metadata: { basement_level: b, floor_type: `BASEMENT_${b}` }
      });
    }
  }

  if (upperParkingCount > 0) {
    for (let p = 1; p <= upperParkingCount; p++) {
      const pZone = `Upper Parking ${p}`;
      const pFinDuration = 14;
      const pFinStart = addCalendarDays(tExtPlaster.planned_finish_date, 3);
      const pFinFinish = addCalendarDays(pFinStart, pFinDuration - 1);
      pushTask({
        temp_id: `draft-${taskOrder}`,
        task_name: `${pZone} — Heavy-duty Epoxy Floor Coating, Ramp Safety Railings & Traffic Signage`,
        category: 'Finishing & Services',
        construction_stage: 'Finishing & Services',
        floor_zone: pZone,
        duration_days: pFinDuration,
        order_index: taskOrder++,
        predecessors: [{ predecessor_id: tExtPlaster.temp_id, type: 'FS', lag: 3 }],
        planned_start_date: formatDateStr(pFinStart),
        planned_finish_date: formatDateStr(pFinFinish),
        metadata: { parking_level: p, floor_type: 'UPPER_PARKING' }
      });
    }
  }

  // Testing & Commissioning
  const testDuration = 14;
  const testStart = addCalendarDays(tSiteDev.planned_finish_date, 2);
  const testFinish = addCalendarDays(testStart, testDuration - 1);
  pushTask({
    temp_id: `draft-${taskOrder}`,
    task_name: 'MEP Testing, Water Supply Pressurisation & Electrical Handover',
    category: 'Testing, Commissioning & Handover',
    construction_stage: 'Handover',
    floor_zone: 'Project Wide',
    duration_days: testDuration,
    order_index: taskOrder++,
    predecessors: [
      { predecessor_id: tSiteDev.temp_id, type: 'FS', lag: 2 },
      { predecessor_id: tFire.temp_id, type: 'FS', lag: 2 }
    ],
    planned_start_date: formatDateStr(testStart),
    planned_finish_date: formatDateStr(testFinish)
  });

  return tasks;
}

module.exports = {
  generateDraftActivities,
  formatDateStr,
  parseDateStr,
  addCalendarDays
};
