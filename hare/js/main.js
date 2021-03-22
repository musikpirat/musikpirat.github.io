setup();

function setup() {
  let inputs = document.getElementById("inputs");
  for (let i = 0; i < 10; i++) {
    let tr = document.createElement("tr");

    let name_td = document.createElement("td");
    let name = document.createElement("input");
    name_td.appendChild(name);
    name_td.className = "list_name";
    tr.appendChild(name_td);

    let votes_td = document.createElement("td");
    let votes = document.createElement("input");
    votes.className = "list";
    votes.type = "number";
    votes.id = "list_"+i;
    votes.onchange = () => recalc();
    votes_td.appendChild(votes);
    tr.appendChild(votes_td);

    let result_percent = document.createElement("td");
    result_percent.id = "result_percent_"+i;
    tr.appendChild(result_percent);

    let result_integer = document.createElement("td");
    result_integer.id = "result_integer_"+i;
    tr.appendChild(result_integer);

    let remainder = document.createElement("td");
    remainder.id = "remainder_"+i;
    tr.appendChild(remainder);

    let result_remainder = document.createElement("td");
    result_remainder.id = "result_remainder_"+i;
    tr.appendChild(result_remainder);

    let result = document.createElement("td");
    result.id = "result_"+i;
    tr.appendChild(result);
    inputs.appendChild(tr);
  }
}

function recalc() {
  let lists = document.getElementsByClassName("list");
  let votes = 0;
  let seats = document.getElementById("seats").value;
  for (let i = 0; i < lists.length; i++) {
    votes += Number(lists[i].value);
  }

  let majority_pos = -1;
  let seats_per_list = [];
  let remainder = [];
  let distributed_seats = 0;
  let majority = Math.floor(seats / 2) + 1;
  for (let i = 0; i < lists.length; i++) {
    let result_percent = lists[i].value / votes * 100;
    let total_seats = result_percent / 100 * seats;
    let current_seats = Math.floor(total_seats);
    if ((lists[i].value > votes / 2) && (current_seats < majority)) {
      current_seats = majority;
      majority_pos = i;
      remainder.push(-1);
    } else {
      remainder.push(total_seats - current_seats);
    }
    if (lists[i].value.length === 0) {
      document.getElementById("result_integer_"+i).innerText = "";
      document.getElementById("result_percent_"+i).innerText = "";
      document.getElementById("remainder_"+i).innerText = "";
    } else {
      document.getElementById("result_integer_" + i).innerText = current_seats.toString();
      document.getElementById("result_percent_"+i).innerText = result_percent.toFixed(2).toString();
      document.getElementById("remainder_"+i).innerText = (total_seats - current_seats).toFixed(2);
      if (majority_pos === i) {
        document.getElementById("result_integer_"+i).innerText += " (>50%)";
        document.getElementById("remainder_"+i).innerText = (total_seats - current_seats + 1).toFixed(2);
      }
      document.getElementById("result_remainder_"+i).innerText = "";
    }
    distributed_seats += Number(current_seats);
    seats_per_list.push(current_seats);
  }

  document.getElementById("total_votes").innerText = "Verteilte Stimmen: "+votes;

  console.log("Distributes seats: "+distributed_seats);

  let remaining_seats = seats - distributed_seats;
  while (remaining_seats > 0) {
    let highest = 0;
    let current_remainder = 0;
    let lists_with_highest_remainder = 0;
    for (let i = 0; i < remainder.length; i++) {
      current_remainder = remainder[i];
      if (current_remainder > highest) {
        highest = current_remainder;
        lists_with_highest_remainder = 1;
      } else if (current_remainder === highest) {
        lists_with_highest_remainder++;
      }
    }

    console.log("Lists with highest remainder / remaining seats: "+lists_with_highest_remainder+" / "+remaining_seats);

    console.log("Highest: "+highest)
    if (lists_with_highest_remainder > remaining_seats) {
      for (let i = 0; i < remainder.length; i++) {
        current_remainder = remainder[i];
        if (current_remainder === highest) {
          seats_per_list[i] += " (+Los)";
        }
      }
      remaining_seats = 0;
    } else {
      for (let i = 0; i < remainder.length; i++) {
        current_remainder = remainder[i];
        if (current_remainder === highest) {
          console.log("current_remainder / highest: "+current_remainder+" / " +highest);
          document.getElementById("result_remainder_"+i).innerText = "1";
          seats_per_list[i]++;
          distributed_seats++;
          remainder[i] = 0;
        }
      }
      remaining_seats = seats - distributed_seats
    }
  }

  for (let i = 0; i < seats_per_list.length; i++) {
    if (lists[i].value.length === 0) {
      document.getElementById("result_"+i).innerText = "";
    } else {
      let seats = seats_per_list[i].toString();
      if (majority_pos === i) {
        seats += " (>50%)"
      }
      document.getElementById("result_"+i).innerText = seats.toString();
    }
  }
}
