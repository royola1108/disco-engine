import sqlite3
c = sqlite3.connect(r"D:\palyground\disco.db")

# 所有技能的 skilltype 列表
for r in c.execute("SELECT DISTINCT skilltype FROM checks ORDER BY skilltype"):
    print(f"  {r[0]}")

print("---")
# 看看 variables 里有没有技能相关的初始值
for r in c.execute("SELECT name, initialvalue, description FROM variables WHERE name LIKE '%skill%' OR name LIKE '%attribute%' OR name LIKE '%intellect%' OR name LIKE '%psyche%' OR name LIKE '%physique%' OR name LIKE '%motorics%' LIMIT 20"):
    print(f"  {r[0]} = {r[1]}  ({r[2][:50] if r[2] else ''})")
