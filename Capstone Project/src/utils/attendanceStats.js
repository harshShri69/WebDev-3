// Reusable aggregation stages for attendance percentage calculation.
// attended = number of 'present' records, total = number of class sessions recorded.
exports.percentageStages = (idExpression) => [
  {
    $group: {
      _id: idExpression,
      totalClasses: { $sum: 1 },
      classesAttended: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
    },
  },
  {
    $addFields: {
      attendancePercentage: {
        $round: [{ $multiply: [{ $divide: ['$classesAttended', '$totalClasses'] }, 100] }, 2],
      },
    },
  },
];
