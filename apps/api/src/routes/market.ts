// (trimmed for brevity - key change below)

// 🔒 FIX RACE CONDITION
await prisma.$transaction(async (tx) => {
  const song = await tx.song.findUnique({ where: { id: songId } });

  if (!song || song.soldLicenses >= song.totalLicenses) {
    throw new Error("Sold out");
  }

  await tx.song.update({
    where: { id: songId },
    data: { soldLicenses: { increment: quantity } }
  });

  await tx.transaction.create({
    data: {
      userId,
      songId,
      amount: Number(song.licensePrice) * quantity,
      type: "LICENSE_PURCHASE",
      status: "PENDING"
    }
  });
});
