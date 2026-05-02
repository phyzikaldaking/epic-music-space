// shortened for clarity
// INSERT after topBidder logic

if (topBidder) {
  const crown = MeshBuilder.CreateSphere("crown", { diameter: 1.2 }, scene);
  crown.position = new Vector3(0, 8, 5.6);

  const crownMat = new StandardMaterial("crown-mat", scene);
  crownMat.emissiveColor = new Color3(1, 0.8, 0.2);
  crown.material = crownMat;

  const spotlight = MeshBuilder.CreateCylinder("spotlight", { height: 10, diameterTop: 0, diameterBottom: 2 }, scene);
  spotlight.position = new Vector3(0, 4, 5.6);

  const lightMat = new StandardMaterial("light-mat", scene);
  lightMat.emissiveColor = new Color3(1, 0.9, 0.4);
  lightMat.alpha = 0.3;
  spotlight.material = lightMat;
}
