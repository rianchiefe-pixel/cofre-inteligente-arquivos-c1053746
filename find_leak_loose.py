import itertools
items = [
    (15.24, "2a43"), (95.56, "b945"), (95.64, "1241"), (98.41, "d787"),
    (204.00, "6140"), (318.55, "4597"), (409.56, "8426"), (526.08, "3144"),
    (1029.12, "8107"), (4766.93, "35fc"), (5646.67, "53b4"), (5769.19, "7bfa"),
    (6612.50, "8d73"), (27450.60, "9ba1"), (209700.00, "c57b")
]
target = 25184.74
for r in range(1, len(items) + 1):
    for combo in itertools.combinations(items, r):
        s = sum(x[0] for x in combo)
        if abs(s - target) < 5.0:
            print(f"Perto: {s} | Diff: {s-target}")
